"""
Per-user stage-notification preferences.

Single source of truth for the gate that decides whether a stage event
(``stage_started`` / ``stage_progress`` / ``stage_finished`` /
``stage_failed``) actually produces a feed row + push for a given user.

Strict per-user isolation
-------------------------
Every public function takes a ``user_id`` and queries ONLY that user's row
in ``freelancer_notification_configs``. There is no broadcast read path,
so user A's preference can never silence user B's notifications and vice
versa.

Default policy
--------------
Missing row → ENABLED. Matches the historical behaviour (every stage
event was always notified). The user opts OUT explicitly per job from
the Scheduler page; turning the toggle back on simply deletes / flips
the row.

A short in-process TTL cache keeps the gate cheap on the hot path —
stage events fire many times per pipeline run, but preferences change
on user click so a stale read recovers within seconds. The cache key
is ``(user_id, job_id)`` so flipping one user's preference cannot
inadvertently surface from another user's cached read.
"""
from __future__ import annotations

import time
from typing import Optional

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_maker
from app.models.freelancer_notification_config import FreelancerNotificationConfig


# Stage names that are governed by this gate. Anything outside this set is
# treated as a non-stage event (system messages, app updates) and bypasses
# the gate entirely. Keep in sync with the stage registry in
# ``app/api/v1/pipeline.py`` and ``app/core/scheduler.py``.
GOVERNED_STAGES: set[str] = {
    "discovery",
    "qualification",
    "personalization",
    "outreach",
    "reply_poll",
    "daily_report",
    "followup_dispatch",
    "weekly_optimization",
    "threads_discovery",
    "threads_qualification",
    "threads_engagement",
    "threads_response_check",
    "single_lead_outreach",
}


# (user_id, job_id) → (enabled, monotonic_at)
_CACHE: dict[tuple[int, str], tuple[bool, float]] = {}
_CACHE_TTL = 10.0  # seconds


def _normalize_job_id(stage: str) -> str:
    """Normalise a stage label to its canonical job_id.

    Defensive — most call sites already pass the canonical underscored
    name (``"daily_report"``), but a handful of legacy display labels use
    hyphens (``"daily-report"``). Convert both to the same key so the
    user's preference is honoured no matter which form the caller used.
    """
    return (stage or "").replace("-", "_").strip()


def invalidate(user_id: int, job_id: Optional[str] = None) -> None:
    """Drop cached preferences for a user (optionally for a specific job).

    Called by the API layer after a write so the next gate check sees the
    fresh value without waiting for the TTL to expire.
    """
    if job_id is None:
        for key in list(_CACHE.keys()):
            if key[0] == user_id:
                _CACHE.pop(key, None)
        return
    _CACHE.pop((user_id, _normalize_job_id(job_id)), None)


async def is_stage_notification_enabled(
    db: AsyncSession,
    user_id: int,
    stage: str,
) -> bool:
    """Return True if ``user_id`` should receive notifications for ``stage``.

    - ``user_id`` is required and is the authoritative isolation key. We
      NEVER fall through to a global preference — each user's row is the
      only thing consulted.
    - Stages outside :data:`GOVERNED_STAGES` always return True so generic
      system / app-update notifications are not affected by this gate.
    - On any DB error we fail OPEN (return True). Notifications are an
      observability surface — better to deliver a redundant card than to
      silently drop it because of a transient lookup failure.
    """
    if not user_id:
        return False
    job_id = _normalize_job_id(stage)
    if not job_id or job_id not in GOVERNED_STAGES:
        return True

    cache_key = (user_id, job_id)
    cached = _CACHE.get(cache_key)
    if cached is not None and (time.monotonic() - cached[1]) < _CACHE_TTL:
        return cached[0]

    try:
        res = await db.execute(
            select(FreelancerNotificationConfig.enabled)
            .where(FreelancerNotificationConfig.user_id == user_id)
            .where(FreelancerNotificationConfig.job_id == job_id)
        )
        row = res.first()
        enabled = True if row is None else bool(row[0])
    except Exception as e:
        logger.warning(
            f"notification preference lookup failed (user={user_id}, "
            f"stage={stage}); defaulting to enabled: {e}"
        )
        enabled = True

    _CACHE[cache_key] = (enabled, time.monotonic())
    return enabled


async def get_user_preferences(user_id: int) -> dict[str, bool]:
    """Return ``{job_id: enabled}`` for one user, with defaults filled in.

    Used by the API ``GET /pipeline/my-notification-config`` endpoint so
    the Scheduler page can render the toggles. Always returns an entry
    for every governed stage (default True) so the UI doesn't need to
    know about the opt-out semantics.
    """
    out: dict[str, bool] = {job_id: True for job_id in GOVERNED_STAGES}
    if not user_id:
        return out

    session_maker = get_session_maker()
    async with session_maker() as db:
        res = await db.execute(
            select(
                FreelancerNotificationConfig.job_id,
                FreelancerNotificationConfig.enabled,
            ).where(FreelancerNotificationConfig.user_id == user_id)
        )
        for row in res.all():
            out[row[0]] = bool(row[1])
    return out


async def set_user_preference(user_id: int, job_id: str, enabled: bool) -> None:
    """Upsert one (user, job) preference and invalidate the cache."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    job_id = _normalize_job_id(job_id)
    if job_id not in GOVERNED_STAGES:
        raise ValueError(f"Unknown notification job_id '{job_id}'")
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be a boolean")

    session_maker = get_session_maker()
    async with session_maker() as db:
        bind = db.get_bind() if hasattr(db, "get_bind") else None
        dialect = getattr(getattr(bind, "dialect", None), "name", "")
        if dialect == "postgresql":
            stmt = (
                pg_insert(FreelancerNotificationConfig)
                .values(user_id=user_id, job_id=job_id, enabled=enabled)
                .on_conflict_do_update(
                    constraint="uq_freelancer_notif_user_job",
                    set_={"enabled": enabled},
                )
            )
            await db.execute(stmt)
        else:
            # SQLite test path — manual upsert.
            existing = await db.execute(
                select(FreelancerNotificationConfig)
                .where(FreelancerNotificationConfig.user_id == user_id)
                .where(FreelancerNotificationConfig.job_id == job_id)
            )
            row = existing.scalars().first()
            if row is None:
                db.add(
                    FreelancerNotificationConfig(
                        user_id=user_id, job_id=job_id, enabled=enabled
                    )
                )
            else:
                row.enabled = enabled
        await db.commit()

    invalidate(user_id, job_id)
