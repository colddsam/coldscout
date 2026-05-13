"""
Dynamic API Key Orchestrator & Load Balancer.

This module is the single source of truth for every outbound API credential.
Modules that previously called ``settings.GROQ_API_KEY`` (or its peers)
now ask the manager for the best available key for a given
``(provider, use_case)`` pair. The manager:

  * Rotates between every active credential in the database pool,
  * Cools a key down on rate-limit / quota errors (configurable durations),
  * Disables permanently bad credentials,
  * Increments usage / failure counters for the admin analytics page,
  * Falls back transparently to the legacy ``.env`` value when no DB key
    matches — so deployments that haven't seeded keys keep working.

The ``with_key_failover`` decorator wraps an async callable that performs a
single API call. When the wrapped callable raises a quota / rate-limit
exception, the decorator marks the active key as cooled-down and retries
with the next-best key up to ``max_attempts`` times.
"""

from __future__ import annotations

import asyncio
import inspect
import os
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from functools import wraps
from typing import Awaitable, Callable, Optional, TypeVar
from uuid import UUID

from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.database import get_session_maker
from app.core.key_encryption import decrypt_api_key, InvalidToken
from app.models.infrastructure import APIProvider


# ── Vocabulary ─────────────────────────────────────────────────────────────


class Provider(str, Enum):
    """Allowed values for ``api_providers.provider_name``."""

    GROQ = "GROQ"
    GOOGLE_PLACES = "GOOGLE_PLACES"
    GEMINI = "GEMINI"
    META_THREADS = "META_THREADS"


class UseCase(str, Enum):
    """Allowed values for ``api_providers.use_case``.

    A key tagged ``GENERAL`` is eligible for every workload. More-specific
    tags take priority — see ``_candidate_use_cases``.
    """

    DISCOVERY = "DISCOVERY"
    SCORING = "SCORING"
    PERSONALIZATION = "PERSONALIZATION"
    WEBSITE_DEMO = "WEBSITE_DEMO"
    GENERAL = "GENERAL"


VALID_PROVIDERS = {p.value for p in Provider}
VALID_USE_CASES = {u.value for u in UseCase}


# Which use cases each provider actually serves in the codebase. Drives the
# admin UI's use-case dropdown (so an operator adding a GEMINI key isn't
# offered "SCORING" — Gemini is never called for scoring). ``GENERAL`` is
# always available as the catch-all that covers every relevant use case.
PROVIDER_USE_CASES: dict[str, list[str]] = {
    Provider.GROQ.value: [
        UseCase.GENERAL.value,
        UseCase.DISCOVERY.value,
        UseCase.SCORING.value,
        UseCase.PERSONALIZATION.value,
        UseCase.WEBSITE_DEMO.value,
    ],
    Provider.GEMINI.value: [
        UseCase.GENERAL.value,
        UseCase.WEBSITE_DEMO.value,
    ],
    Provider.GOOGLE_PLACES.value: [
        UseCase.GENERAL.value,
        UseCase.DISCOVERY.value,
    ],
    Provider.META_THREADS.value: [
        UseCase.GENERAL.value,
        UseCase.PERSONALIZATION.value,
        UseCase.SCORING.value,
    ],
}


def use_cases_for_provider(provider: str) -> list[str]:
    """Return the allowed use-case vocabulary for a given provider.

    Falls back to ``[GENERAL]`` for providers that aren't explicitly mapped
    — that way new providers don't have to round-trip through this file
    before the admin UI lets you add them.
    """
    return PROVIDER_USE_CASES.get(provider, [UseCase.GENERAL.value])


# ── Errors ─────────────────────────────────────────────────────────────────


class KeyExhaustedError(RuntimeError):
    """Raised by the failover decorator when every candidate key is cool-down
    or has hit its quota. The caller should surface this as a 503 rather
    than silently dropping the request."""


class InvalidProviderKeyError(RuntimeError):
    """Raised inside a provider call to signal a permanently bad credential.
    The manager will deactivate the row and the failover decorator will
    transparently retry with the next key."""


# ── Cooldown policy ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class _CooldownPolicy:
    duration: timedelta
    disable: bool = False
    # ``retryable`` tells the failover decorator whether the cooled-down key
    # signals a transient problem (worth rotating to the next key) versus
    # something unusual the caller probably wants to surface (transient
    # connectivity, a 500 we shouldn't paper over by burning the whole pool).
    retryable: bool = True

    @property
    def seconds(self) -> int:
        return int(self.duration.total_seconds())


# These map error types to durations. Tuned per the project spec.
# Note: ``_COOLDOWN_TEMP_FAILURE`` is non-retryable — we don't want to chew
# through every credential in the pool just because the network blipped.
_COOLDOWN_RATE_LIMIT = _CooldownPolicy(timedelta(seconds=60), retryable=True)
_COOLDOWN_QUOTA = _CooldownPolicy(timedelta(hours=1), retryable=True)
_COOLDOWN_TEMP_FAILURE = _CooldownPolicy(timedelta(seconds=30), retryable=False)
_COOLDOWN_INVALID = _CooldownPolicy(
    timedelta(days=365 * 10), disable=True, retryable=True,
)

# Upper bound on any parsed retry-after value. Caps the worst-case where
# a buggy or malicious provider message claims a 24h wait — we never freeze
# a key longer than the standard quota policy without operator intervention.
_RETRY_AFTER_MAX_SECONDS = 3600  # 1 hour
# Lower bound — anything below 1 second isn't worth cooling down for; the
# next caller's network jitter alone exceeds that.
_RETRY_AFTER_MIN_SECONDS = 1
# Safety buffer added to any parsed retry-after so we never wake a key
# microseconds before the provider is ready.
_RETRY_AFTER_BUFFER_SECONDS = 1.0


# Heuristics for classifying provider exceptions when callers don't tell us
# explicitly. Kept as compiled regexes so misclassification is auditable.
_QUOTA_PATTERNS = [
    re.compile(r"quota", re.IGNORECASE),
    re.compile(r"resource\s*exhausted", re.IGNORECASE),
    re.compile(r"insufficient_quota", re.IGNORECASE),
]
_RATE_LIMIT_PATTERNS = [
    re.compile(r"\b429\b"),
    re.compile(r"rate\s*limit", re.IGNORECASE),
    re.compile(r"too many requests", re.IGNORECASE),
]
_INVALID_PATTERNS = [
    re.compile(r"invalid[_ ]api[_ ]key", re.IGNORECASE),
    re.compile(r"unauthori[sz]ed", re.IGNORECASE),
    re.compile(r"\b401\b"),
    re.compile(r"\b403\b"),
    re.compile(r"api[_ ]key\s+not\s+valid", re.IGNORECASE),
]

# Captures "try again in 14.2s", "trying again in 500ms", "retry in 30s",
# "retry after 12.5 seconds", "please retry in 2 minutes", "wait 5s" etc.
# Both 'in' and the 'again|after' modifier are optional so we tolerate
# minor phrasing differences across providers.
_RETRY_AFTER_PATTERN = re.compile(
    r"(?:try(?:ing)?|retry|wait)"          # verb stem
    r"(?:\s+(?:again|after))?"             # optional modifier
    r"\s+(?:in\s+|after\s+)?"               # optional "in"/"after"
    r"(\d+(?:\.\d+)?)"                     # numeric value (1)
    r"\s*(ms|milliseconds?|s|seconds?|m|minutes?|h|hours?)\b",
    re.IGNORECASE,
)


def _extract_retry_after_seconds(msg: str) -> Optional[float]:
    """Parse a retry-after hint from a provider error message.

    Returns the wait in seconds (with the safety buffer applied and clamped
    to ``[_RETRY_AFTER_MIN_SECONDS, _RETRY_AFTER_MAX_SECONDS]``), or ``None``
    if no retry hint was found.
    """
    if not msg:
        return None
    match = _RETRY_AFTER_PATTERN.search(msg)
    if not match:
        return None
    raw, unit = match.groups()
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    unit_lower = unit.lower()
    if unit_lower.startswith("ms") or unit_lower.startswith("milli"):
        seconds = val / 1000.0
    elif unit_lower.startswith("h"):
        seconds = val * 3600.0
    elif unit_lower.startswith("m") and not unit_lower.startswith("ms"):
        seconds = val * 60.0
    else:
        seconds = val  # plain seconds
    seconds += _RETRY_AFTER_BUFFER_SECONDS
    # Reject absurd or negative values so a bogus header can't disable a key.
    if seconds <= 0:
        return None
    if seconds < _RETRY_AFTER_MIN_SECONDS:
        seconds = float(_RETRY_AFTER_MIN_SECONDS)
    if seconds > _RETRY_AFTER_MAX_SECONDS:
        seconds = float(_RETRY_AFTER_MAX_SECONDS)
    return seconds


def classify_error(exc: BaseException) -> _CooldownPolicy:
    """Return the cooldown policy that matches this exception.

    Falls back to ``_COOLDOWN_TEMP_FAILURE`` for unrecognised errors so the
    same key isn't immediately re-tried on transient infra blips.

    The parser first looks for an explicit "try again in Xs" hint inside the
    error message — Groq and Gemini both emit these, and respecting them
    recovers a free-tier key in seconds rather than the flat 60s default.
    """
    if isinstance(exc, InvalidProviderKeyError):
        return _COOLDOWN_INVALID
    msg = str(exc) or exc.__class__.__name__

    # 1. Dynamic retry-after hint (most precise — provider tells us exactly
    # when to come back). Only treat the hint as authoritative for
    # quota / rate-limit errors; a 401 with "retry in 3s" should still
    # disable the key.
    status = getattr(exc, "status_code", None)
    retry_after = _extract_retry_after_seconds(msg)

    if status in (401, 403):
        return _COOLDOWN_INVALID
    for pat in _INVALID_PATTERNS:
        if pat.search(msg):
            return _COOLDOWN_INVALID

    if retry_after is not None:
        # Dynamic retry-after hints come from rate-limit / quota responses,
        # so the resulting policy is always retryable from the decorator's
        # point of view — try the next key instead of bubbling the error.
        return _CooldownPolicy(timedelta(seconds=retry_after), retryable=True)

    if status == 429:
        return _COOLDOWN_RATE_LIMIT
    for pat in _QUOTA_PATTERNS:
        if pat.search(msg):
            return _COOLDOWN_QUOTA
    for pat in _RATE_LIMIT_PATTERNS:
        if pat.search(msg):
            return _COOLDOWN_RATE_LIMIT
    return _COOLDOWN_TEMP_FAILURE


# ── Selection context ──────────────────────────────────────────────────────


@dataclass
class SelectedKey:
    """The payload returned by ``get_best_key``.

    ``provider_id`` is ``None`` when the key came from the legacy ``.env``
    fallback — in that case the manager has nothing to mark as used/cooled.
    """

    provider_id: Optional[UUID]
    api_key: str
    source: str  # "db" | "env"
    provider_name: str
    use_case: str


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _candidate_use_cases(use_case: str) -> list[str]:
    """Return the use_case search order — specific first, then GENERAL."""
    if use_case == UseCase.GENERAL.value:
        return [UseCase.GENERAL.value]
    return [use_case, UseCase.GENERAL.value]


def _env_fallback_key(provider: str) -> Optional[str]:
    """Return the legacy ``.env`` credential for a provider, if configured.

    Lets deployments that haven't seeded the database keep working — no
    operator surprise on day 1 after upgrade.
    """
    settings = get_settings()
    mapping = {
        Provider.GROQ.value: getattr(settings, "GROQ_API_KEY", None),
        Provider.GOOGLE_PLACES.value: getattr(settings, "GOOGLE_PLACES_API_KEY", None),
        Provider.GEMINI.value: getattr(settings, "GEMINI_API_KEY", None),
        Provider.META_THREADS.value: getattr(settings, "THREADS_APP_SECRET", None),
    }
    value = mapping.get(provider)
    return value or None


# ── Manager ────────────────────────────────────────────────────────────────


_T = TypeVar("_T")


class APIKeyManager:
    """Singleton orchestrator. Use the module-level ``key_manager`` instance."""

    def __init__(self) -> None:
        # A single lock serialises selection so two concurrent requests for
        # the same (provider, use_case) don't both grab the same "least
        # recently used" key in the same millisecond. The window is tiny
        # because selection touches the DB only — provider calls happen
        # outside the lock.
        self._select_lock = asyncio.Lock()

    # ── Selection ──────────────────────────────────────────────────────

    async def get_best_key(
        self,
        provider: Provider | str,
        use_case: UseCase | str = UseCase.GENERAL,
    ) -> SelectedKey:
        """Return the most-suitable credential for ``(provider, use_case)``.

        Selection rules (in order):
          1. Filter ``provider_name == provider`` AND ``use_case`` in
             ``[use_case, "GENERAL"]`` AND ``is_active`` AND
             ``(cooldown_until IS NULL OR cooldown_until <= now())``.
          2. Sort by least-recently-used, then lowest usage_count, then
             oldest created_at as a tie-breaker.
          3. Mark the chosen row's ``last_used_at`` and bump
             ``usage_count`` so subsequent selections rotate.
          4. If no DB row matches, fall back to the corresponding
             ``settings.<provider>_API_KEY`` env value.
          5. If neither path yields a key, raise ``KeyExhaustedError``.
        """
        provider_value = provider.value if isinstance(provider, Provider) else str(provider)
        use_case_value = use_case.value if isinstance(use_case, UseCase) else str(use_case)
        if provider_value not in VALID_PROVIDERS:
            raise ValueError(f"Unknown provider: {provider_value}")
        if use_case_value not in VALID_USE_CASES:
            raise ValueError(f"Unknown use_case: {use_case_value}")

        async with self._select_lock:
            session_maker = get_session_maker()
            try:
                async with session_maker() as session:
                    row = await self._pick_row(
                        session, provider_value, use_case_value
                    )
                    if row is not None:
                        try:
                            plaintext = decrypt_api_key(row.encrypted_api_key)
                        except (InvalidToken, ValueError) as e:
                            # The stored ciphertext is unreadable (likely the
                            # APP_SECRET_KEY rotated). Disable the row so the
                            # next caller doesn't hit the same wall and fall
                            # through to env below.
                            logger.error(
                                "Disabling api_providers row {} — decryption failed: {}",
                                row.id,
                                e,
                            )
                            await session.execute(
                                update(APIProvider)
                                .where(APIProvider.id == row.id)
                                .values(
                                    is_active=False,
                                    last_failure_at=_now(),
                                    last_failure_reason="decryption failed",
                                )
                            )
                            await session.commit()
                        else:
                            # Stamp usage atomically before releasing the lock.
                            await session.execute(
                                update(APIProvider)
                                .where(APIProvider.id == row.id)
                                .values(
                                    last_used_at=_now(),
                                    usage_count=APIProvider.usage_count + 1,
                                )
                            )
                            await session.commit()
                            return SelectedKey(
                                provider_id=row.id,
                                api_key=plaintext,
                                source="db",
                                provider_name=provider_value,
                                use_case=use_case_value,
                            )
            except Exception as e:
                # DB unavailable, schema not migrated yet, or any other
                # infra blip: fall through to env. The orchestrator must
                # never block a provider call just because the pool table
                # can't be read.
                logger.debug(
                    "key_manager: DB lookup failed, falling back to env. {}", e
                )

        # Fallback: env-configured key. Doesn't get usage tracking because
        # there's no DB row to attribute it to.
        env_key = _env_fallback_key(provider_value)
        if env_key:
            return SelectedKey(
                provider_id=None,
                api_key=env_key,
                source="env",
                provider_name=provider_value,
                use_case=use_case_value,
            )

        raise KeyExhaustedError(
            f"No active {provider_value} keys available for use_case={use_case_value}"
        )

    async def _pick_row(
        self,
        session: AsyncSession,
        provider: str,
        use_case: str,
    ) -> Optional[APIProvider]:
        """Run the selection query. Encapsulated so tests can override."""
        candidates = _candidate_use_cases(use_case)
        stmt = (
            select(APIProvider)
            .where(
                APIProvider.provider_name == provider,
                APIProvider.use_case.in_(candidates),
                APIProvider.is_active.is_(True),
            )
            .order_by(
                # Highest weight first — gives operators an explicit "prefer
                # this key" lever (e.g. a paid key with weight=10 wins until
                # it cools down or fails).
                APIProvider.weight.desc(),
                # Within the same weight bucket: least-recently used first;
                # rows that have never been used (NULL last_used_at) get the
                # highest priority by sorting NULL first via a portable
                # IS-NULL boolean expression (works on PG and SQLite).
                APIProvider.last_used_at.is_(None).desc(),
                APIProvider.last_used_at.asc(),
                APIProvider.usage_count.asc(),
                APIProvider.created_at.asc(),
            )
        )
        result = await session.execute(stmt)
        now = _now()
        for row in result.scalars():
            cooldown = row.cooldown_until
            if cooldown is not None:
                # SQLite strips tzinfo when round-tripping DateTime(timezone=True)
                # columns; coerce to a tz-aware UTC value so the comparison
                # below never crashes with "can't compare naive vs aware".
                if cooldown.tzinfo is None:
                    cooldown = cooldown.replace(tzinfo=timezone.utc)
                if cooldown > now:
                    continue
            return row
        return None

    # ── Reporting ──────────────────────────────────────────────────────

    async def mark_cooldown(
        self,
        provider_id: Optional[UUID],
        exc: BaseException,
    ) -> None:
        """Apply the appropriate cooldown for the active key after a failure.

        Safe to call with ``provider_id=None`` (env-fallback key) — it
        becomes a no-op since there's no DB row to update.
        """
        if provider_id is None:
            return
        policy = classify_error(exc)
        until = _now() + policy.duration
        reason = (str(exc) or exc.__class__.__name__)[:255]
        try:
            session_maker = get_session_maker()
            async with session_maker() as session:
                values: dict = {
                    "cooldown_until": until,
                    "last_failure_at": _now(),
                    "last_failure_reason": reason,
                    "rate_limit_hits": APIProvider.rate_limit_hits + 1,
                }
                if policy.disable:
                    values["is_active"] = False
                else:
                    values["total_failures"] = APIProvider.total_failures + 1
                await session.execute(
                    update(APIProvider)
                    .where(APIProvider.id == provider_id)
                    .values(**values)
                )
                await session.commit()
        except Exception:
            # Never let a bookkeeping failure mask the original provider
            # error — logging is enough.
            logger.exception(
                "Failed to record cooldown for provider_id={}", provider_id
            )

    async def mark_invalid(self, provider_id: Optional[UUID], reason: str) -> None:
        """Permanently disable a credential."""
        if provider_id is None:
            return
        try:
            session_maker = get_session_maker()
            async with session_maker() as session:
                await session.execute(
                    update(APIProvider)
                    .where(APIProvider.id == provider_id)
                    .values(
                        is_active=False,
                        cooldown_until=_now() + _COOLDOWN_INVALID.duration,
                        last_failure_at=_now(),
                        last_failure_reason=reason[:255],
                    )
                )
                await session.commit()
        except Exception:
            logger.exception("mark_invalid failed for {}", provider_id)


key_manager = APIKeyManager()


# ── Decorator ──────────────────────────────────────────────────────────────


def with_key_failover(
    provider: Provider,
    use_case: UseCase = UseCase.GENERAL,
    max_attempts: int = 4,
) -> Callable[[Callable[..., Awaitable[_T]]], Callable[..., Awaitable[_T]]]:
    """Wrap an async function so each call automatically rotates keys on failure.

    The wrapped function MUST accept a keyword argument ``api_key`` — that's
    the freshly-rotated credential. On a quota / rate-limit error the
    decorator cools the active key, picks the next-best one, and retries
    up to ``max_attempts`` times before bubbling ``KeyExhaustedError``.
    """

    def decorator(func: Callable[..., Awaitable[_T]]) -> Callable[..., Awaitable[_T]]:
        if not inspect.iscoroutinefunction(func):
            raise TypeError(
                "with_key_failover requires an async (coroutine) function"
            )

        @wraps(func)
        async def wrapper(*args, **kwargs) -> _T:  # noqa: ANN401
            last_exc: Optional[BaseException] = None
            tried_ids: set[UUID] = set()
            for attempt in range(1, max_attempts + 1):
                selected = await key_manager.get_best_key(provider, use_case)
                if (
                    selected.provider_id is not None
                    and selected.provider_id in tried_ids
                ):
                    # The pool exhausted its rotation within this single
                    # request — every candidate has now failed. Bail out.
                    break
                if selected.provider_id is not None:
                    tried_ids.add(selected.provider_id)

                kwargs["api_key"] = selected.api_key
                try:
                    return await func(*args, **kwargs)
                except KeyExhaustedError:
                    raise
                except Exception as exc:  # noqa: BLE001 - intentional broad catch
                    last_exc = exc
                    await key_manager.mark_cooldown(selected.provider_id, exc)
                    policy = classify_error(exc)
                    logger.warning(
                        "[key_failover] attempt {}/{} failed for provider={} "
                        "use_case={} source={} reason={}",
                        attempt,
                        max_attempts,
                        provider.value,
                        use_case.value,
                        selected.source,
                        (str(exc) or exc.__class__.__name__)[:160],
                    )
                    # If the policy isn't retryable (e.g. a generic 5xx /
                    # network blip), don't burn the entire rotation on this
                    # kind of failure — surface the error to the caller.
                    if not policy.retryable:
                        raise

            # Either max_attempts exhausted or rotation looped.
            raise KeyExhaustedError(
                f"All {provider.value} keys exhausted after {max_attempts} attempts: "
                f"{last_exc!r}"
            ) from last_exc

        return wrapper

    return decorator


# ── Admin helpers ──────────────────────────────────────────────────────────


async def list_providers(
    session: AsyncSession,
    provider: Optional[str] = None,
) -> list[APIProvider]:
    """Return every key row (filtered optionally by provider) ordered for UI display."""
    stmt = select(APIProvider).order_by(
        APIProvider.provider_name.asc(),
        APIProvider.use_case.asc(),
        APIProvider.created_at.asc(),
    )
    if provider:
        stmt = stmt.where(APIProvider.provider_name == provider)
    result = await session.execute(stmt)
    return list(result.scalars())


def provider_status(row: APIProvider) -> str:
    """UI status: ``active`` | ``cooldown`` | ``disabled``."""
    if not row.is_active:
        return "disabled"
    cooldown = row.cooldown_until
    if cooldown is not None:
        # Normalise tz so SQLite-stored naive datetimes compare correctly.
        if cooldown.tzinfo is None:
            cooldown = cooldown.replace(tzinfo=timezone.utc)
        if cooldown > _now():
            return "cooldown"
    return "active"


# ── Weight rebalancing (ripple-down) ───────────────────────────────────────


WEIGHT_MIN = 1
WEIGHT_MAX = 100


@dataclass
class WeightCollision:
    """Represents one row whose weight got rippled down to make room."""

    id: UUID
    label: Optional[str]
    use_case: str
    old_weight: int
    new_weight: int


async def preview_weight_collision(
    session: AsyncSession,
    provider: str,
    new_weight: int,
    exclude_id: Optional[UUID] = None,
) -> list[WeightCollision]:
    """Compute what the ripple-down cascade *would* do without writing.

    Used by the admin UI to show "weight 5 is currently used by 'primary' —
    it will be pushed to 4" before the operator commits a change.
    """
    rows = await _load_provider_weights(session, provider, exclude_id)
    return _simulate_rebalance(rows, new_weight)


async def apply_weight_rebalance(
    session: AsyncSession,
    provider: str,
    new_weight: int,
    exclude_id: Optional[UUID] = None,
) -> list[WeightCollision]:
    """Run the ripple-down rebalance and persist the changes.

    Returns the list of rows that were shifted so the API can echo them
    back to the operator. The caller is responsible for committing the
    session — we stage updates within the active transaction so an upstream
    failure rolls everything back atomically.
    """
    rows = await _load_provider_weights(session, provider, exclude_id)
    collisions = _simulate_rebalance(rows, new_weight)
    for shift in collisions:
        await session.execute(
            update(APIProvider)
            .where(APIProvider.id == shift.id)
            .values(weight=shift.new_weight)
        )
    return collisions


async def _load_provider_weights(
    session: AsyncSession,
    provider: str,
    exclude_id: Optional[UUID],
) -> list[APIProvider]:
    """Fetch all same-provider rows (excluding ``exclude_id``) ordered by weight DESC."""
    stmt = (
        select(APIProvider)
        .where(APIProvider.provider_name == provider)
        .order_by(APIProvider.weight.desc(), APIProvider.created_at.asc())
    )
    if exclude_id is not None:
        stmt = stmt.where(APIProvider.id != exclude_id)
    result = await session.execute(stmt)
    return list(result.scalars())


def _simulate_rebalance(
    rows: list[APIProvider],
    new_weight: int,
) -> list[WeightCollision]:
    """Apply the ripple-down algorithm in memory.

    Algorithm:
      1. If no existing row holds ``new_weight``, no shifts are needed.
      2. Otherwise, the *original* occupant of slot ``W`` drops to
         ``W - 1``. If slot ``W - 1`` was already occupied beforehand,
         the original occupant of that slot continues the cascade.
      3. The cascade stops the moment a freshly-vacated occupant lands on
         an empty slot, or when we hit the floor (``WEIGHT_MIN``).
      4. At the floor we stop. Multiple rows may legitimately share the
         floor weight after a long cascade — the manager's selection logic
         handles ties via the usage-count tiebreaker.

    Returns only the rows whose weight actually changed.

    Why evict the original occupant (FIFO) rather than the just-moved one
    (LIFO)?  Eviction order matters when slot ``W - 1`` was already taken
    — we want to preserve the relative ordering of the pre-existing keys
    so a newly-arrived cascading occupant ends up *between* the others
    rather than tunnelling all the way to the floor.
    """
    # Build a {weight: list[row]} map. We never modify the row objects —
    # we work with plain ints and only emit WeightCollision records.
    current: dict[int, list[APIProvider]] = {}
    for row in rows:
        current.setdefault(int(row.weight), []).append(row)

    changes: dict[UUID, WeightCollision] = {}
    slot = new_weight

    # Track whether the slot we're currently processing was already occupied
    # before any cascading insertions — only then do we keep walking down.
    while slot in current and current[slot]:
        # Floor reached and there's already someone at the floor: stop. We
        # allow duplicates at the floor rather than recurse into 0/negative.
        if slot == WEIGHT_MIN:
            break

        # Evict the *original* occupant (FIFO). Any occupant that was placed
        # here by a previous iteration of this cascade sits at the tail and
        # is preserved across the rest of the rebalance.
        occupant = current[slot].pop(0)
        target = slot - 1

        old_weight = (
            changes[occupant.id].old_weight
            if occupant.id in changes
            else int(occupant.weight)
        )
        changes[occupant.id] = WeightCollision(
            id=occupant.id,
            label=occupant.label,
            use_case=occupant.use_case,
            old_weight=old_weight,
            new_weight=target,
        )

        # Was the target slot already occupied *before* we move the
        # cascading occupant in? That's what determines whether we need to
        # keep cascading after this step.
        target_was_occupied = bool(current.get(target))
        current.setdefault(target, []).append(occupant)
        if not target_was_occupied:
            break
        slot = target

    return list(changes.values())
