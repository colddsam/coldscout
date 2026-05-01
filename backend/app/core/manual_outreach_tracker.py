"""
Per-lead manual outreach tracker (Redis-backed).

When a freelancer presses the per-lead "Send Now" button on the Leads CRM
the request is enqueued onto the shared ``app.core.job_queue`` worker. While
that single-lead job sits in the queue or runs we need an authoritative way
to tell the UI:

- whether *this specific lead* already has a manual job in flight (so the
  button must stay disabled until the run finishes), and
- the outcome of the most recent manual run (so the UI can surface a
  toast / error label).

We keep this state in Redis with a TTL so a stale entry never permanently
locks the button: even if the worker crashes the lock auto-expires.

Key shape:
    manual_outreach:lead:{lead_id} -> JSON dict

JSON payload fields:
    status        : "queued" | "running" | "completed" | "failed"
    user_id       : int — the freelancer who triggered it
    queued_at     : ISO 8601 UTC timestamp
    started_at    : ISO 8601 UTC | null
    ended_at      : ISO 8601 UTC | null
    error         : str | null  (set on "failed")

If Redis is unreachable every call degrades to a no-op / empty result,
matching the convention used by ``app.core.pipeline_tracker``. The button
will then default to its "eligible" appearance and the backend's lead status
check still prevents accidental double-sends.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from app.core.redis_client import get_redis

_KEY_PREFIX = "manual_outreach:lead"
# Long enough that a multi-minute personalization run plus a slow SMTP
# dispatch can finish and write the terminal status; short enough that a
# crashed worker doesn't permanently lock the button.
_TTL_SECONDS = 60 * 60 * 6  # 6 hours


def _key(lead_id: str) -> str:
    return f"{_KEY_PREFIX}:{lead_id}"


def _safe_get_redis():
    try:
        return get_redis()
    except Exception as e:
        logger.warning(f"Manual outreach tracker: Redis unavailable: {e}")
        return None


async def _load(lead_id: str) -> Optional[dict]:
    r = _safe_get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(_key(lead_id))
    except Exception as e:
        logger.warning(f"Manual outreach tracker load failed: {e}")
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def _save(lead_id: str, payload: dict) -> None:
    r = _safe_get_redis()
    if r is None:
        return
    try:
        await r.set(_key(lead_id), json.dumps(payload), ex=_TTL_SECONDS)
    except Exception as e:
        logger.warning(f"Manual outreach tracker save failed: {e}")


# ── Public API ───────────────────────────────────────────────────────────────


async def get_state(lead_id: str) -> Optional[dict]:
    """Return the current tracker entry for a lead (or None when absent)."""
    return await _load(lead_id)


async def is_in_flight(lead_id: str) -> bool:
    """True if a manual job for this lead is currently queued or running."""
    state = await _load(lead_id)
    if not state:
        return False
    return state.get("status") in ("queued", "running")


async def mark_queued(lead_id: str, user_id: int | str) -> bool:
    """Atomically claim the manual outreach slot for the lead.

    Returns ``True`` if this caller now owns the slot. Returns ``False``
    when another caller already has a queued or running job in flight —
    the API endpoint then surfaces a 409 to block the duplicate request.

    Implementation:
        1. Try a strict SETNX (set-if-not-exists) for the new payload.
        2. If that fails (key already exists), inspect the current entry.
           Allow takeover only when the previous run is in a terminal
           state (``completed`` / ``failed``) so the user can retry after
           a failure without first pressing Unlock.
        3. If Redis is unreachable, optimistically allow the request.
           The single-lead runner re-validates the lead's status in the
           DB before doing any work, so a stale claim cannot lead to
           double-sends.
    """
    payload = {
        "status": "queued",
        "user_id": user_id,
        "queued_at": datetime.now(timezone.utc).isoformat(),
        "started_at": None,
        "ended_at": None,
        "error": None,
    }

    r = _safe_get_redis()
    if r is None:
        return True

    serialized = json.dumps(payload)
    try:
        # ``set(..., nx=True)`` returns truthy when the key was created.
        if await r.set(_key(lead_id), serialized, nx=True, ex=_TTL_SECONDS):
            return True

        # Key exists — only take it over if the prior run is finished.
        raw = await r.get(_key(lead_id))
        existing: dict = {}
        if raw:
            try:
                existing = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                existing = {}
        if existing.get("status") in ("completed", "failed"):
            await r.set(_key(lead_id), serialized, ex=_TTL_SECONDS)
            return True
        return False
    except Exception as e:
        logger.warning(f"Manual outreach tracker mark_queued failed: {e}")
        # Fail open on Redis errors so the feature stays usable; the
        # downstream lead-status check still prevents incorrect sends.
        return True


async def mark_running(lead_id: str) -> None:
    """Transition the lead's manual job from queued → running."""
    state = await _load(lead_id) or {}
    state.update(
        status="running",
        started_at=datetime.now(timezone.utc).isoformat(),
    )
    await _save(lead_id, state)


async def mark_completed(lead_id: str) -> None:
    """Transition the lead's manual job to completed (button stays disabled
    because the lead's status moves past ``qualified``)."""
    state = await _load(lead_id) or {}
    state.update(
        status="completed",
        ended_at=datetime.now(timezone.utc).isoformat(),
        error=None,
    )
    await _save(lead_id, state)


async def mark_failed(lead_id: str, error: str) -> None:
    """Record a failure so the UI can surface the error and re-enable retry."""
    state = await _load(lead_id) or {}
    safe_error = (error or "Unknown error").splitlines()[0][:300]
    state.update(
        status="failed",
        ended_at=datetime.now(timezone.utc).isoformat(),
        error=safe_error,
    )
    await _save(lead_id, state)


async def clear(lead_id: str) -> None:
    """Remove the tracker entry — used when the user presses Unlock."""
    r = _safe_get_redis()
    if r is None:
        return
    try:
        await r.delete(_key(lead_id))
    except Exception as e:
        logger.warning(f"Manual outreach tracker clear failed: {e}")
