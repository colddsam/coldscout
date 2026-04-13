"""
Pipeline Job Tracker — Per-user, per-stage run tracking via Redis.

Tracks each manually or automatically triggered pipeline stage with:
- Status: queued -> running -> completed / failed
- Timestamps for queued_at, started_at, ended_at
- Log messages per job run
- Persistent job history for the Pipeline Log UI

All state is scoped per-user so that concurrent freelancers do not see each
other's active jobs or logs.

Redis key structure (per user):
  pipeline:active_map:{user_id}   -> JSON blob of this user's active stage jobs
  pipeline:history:{user_id}      -> sorted set of this user's completed runs

The single-key-per-user design keeps get_active_jobs() at 1 GET command per
user, regardless of how many stages are active.
"""
import json
import time
from datetime import datetime, timezone
from loguru import logger

from app.core.redis_client import get_redis

# ── Keys ──────────────────────────────────────────────────────────────────────

_ACTIVE_MAP_PREFIX = "pipeline:active_map"
_HISTORY_PREFIX = "pipeline:history"
MAX_HISTORY = 200  # Keep last 200 job runs per user


def _active_map_key(user_id: int | str) -> str:
    return f"{_ACTIVE_MAP_PREFIX}:{user_id}"


def _history_key(user_id: int | str) -> str:
    return f"{_HISTORY_PREFIX}:{user_id}"


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _load_map(r, user_id: int | str) -> dict:
    """Load the user's active-stages map from Redis (single GET)."""
    key = _active_map_key(user_id)
    try:
        raw = await r.get(key)
    except Exception as e:
        logger.warning(f"Pipeline tracker: Redis unavailable during load: {e}")
        return {}
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


async def _save_map(r, user_id: int | str, active_map: dict) -> None:
    """Persist the user's active-stages map to Redis (single SET)."""
    key = _active_map_key(user_id)
    try:
        if active_map:
            await r.set(key, json.dumps(active_map))
        else:
            await r.delete(key)
    except Exception as e:
        logger.warning(f"Pipeline tracker: Redis unavailable during save: {e}")


def _safe_get_redis():
    """Return Redis client or None if unavailable (allows graceful degradation)."""
    try:
        return get_redis()
    except Exception as e:
        logger.warning(f"Pipeline tracker: Redis client unavailable: {e}")
        return None


# ── Public API ────────────────────────────────────────────────────────────────

async def enqueue_job(user_id: int | str, stage: str, triggered_by: str = "manual") -> dict:
    """Mark a stage as queued for a specific user. Returns the job record."""
    now = datetime.now(timezone.utc)
    job = {
        "stage": stage,
        "user_id": user_id,
        "status": "queued",
        "triggered_by": triggered_by,
        "queued_at": now.isoformat(),
        "started_at": None,
        "ended_at": None,
        "logs": [f"[{now.strftime('%H:%M:%S')}] Job queued ({triggered_by})"],
    }
    r = _safe_get_redis()
    if r is None:
        return job
    active_map = await _load_map(r, user_id)
    active_map[stage] = job
    await _save_map(r, user_id, active_map)
    logger.info(f"Pipeline tracker: user={user_id} {stage} queued")
    return job


async def mark_running(user_id: int | str, stage: str) -> None:
    """Transition a user's stage from queued -> running."""
    r = _safe_get_redis()
    if r is None:
        return
    active_map = await _load_map(r, user_id)

    if stage not in active_map:
        now = datetime.now(timezone.utc)
        active_map[stage] = {
            "stage": stage,
            "user_id": user_id,
            "status": "queued",
            "triggered_by": "scheduler",
            "queued_at": now.isoformat(),
            "started_at": None,
            "ended_at": None,
            "logs": [f"[{now.strftime('%H:%M:%S')}] Job queued (scheduler)"],
        }

    job = active_map[stage]
    now = datetime.now(timezone.utc)
    job["status"] = "running"
    job["started_at"] = now.isoformat()
    job["logs"].append(f"[{now.strftime('%H:%M:%S')}] Stage started")
    active_map[stage] = job
    await _save_map(r, user_id, active_map)
    logger.debug(f"Pipeline tracker: user={user_id} {stage} -> running")


async def append_log(user_id: int | str, stage: str, message: str) -> None:
    """Append a log line to the user's active job for a stage."""
    r = _safe_get_redis()
    if r is None:
        return
    active_map = await _load_map(r, user_id)
    if stage not in active_map:
        return
    job = active_map[stage]
    now = datetime.now(timezone.utc)
    job["logs"].append(f"[{now.strftime('%H:%M:%S')}] {message}")
    job["logs"] = job["logs"][-50:]
    active_map[stage] = job
    await _save_map(r, user_id, active_map)


async def mark_completed(user_id: int | str, stage: str, message: str = "Completed successfully") -> None:
    await _finalize(user_id, stage, "completed", message)


async def mark_failed(user_id: int | str, stage: str, error: str = "Unknown error") -> None:
    await _finalize(user_id, stage, "failed", error)


async def get_active_jobs(user_id: int | str) -> dict:
    """Return all active jobs for a user, keyed by stage."""
    r = _safe_get_redis()
    if r is None:
        return {}
    return await _load_map(r, user_id)


async def get_job_history(user_id: int | str, limit: int = 50, offset: int = 0) -> list:
    """Return recent job history entries for a user (newest first)."""
    r = _safe_get_redis()
    if r is None:
        return []
    try:
        entries = await r.zrevrangebyscore(
            _history_key(user_id), "+inf", "-inf",
            start=offset, num=limit
        )
        return [json.loads(e) for e in entries]
    except Exception as e:
        logger.warning(f"Pipeline tracker: Redis unavailable during history fetch: {e}")
        return []


async def get_active_jobs_all_users() -> dict:
    """
    Aggregate every user's active-stages map. Superuser-only use.

    Returns a flat dict keyed by ``"{user_id}:{stage}"`` so the caller can
    render a single combined view across all freelancers.
    """
    r = _safe_get_redis()
    if r is None:
        return {}
    try:
        keys = await r.keys(f"{_ACTIVE_MAP_PREFIX}:*")
    except Exception as e:
        logger.warning(f"Pipeline tracker: failed to scan active-map keys: {e}")
        return {}

    combined: dict = {}
    for k in keys:
        key = k.decode() if isinstance(k, (bytes, bytearray)) else k
        uid = key.rsplit(":", 1)[-1]
        try:
            raw = await r.get(key)
            data = json.loads(raw) if raw else {}
        except Exception:
            continue
        for stage, job in data.items():
            combined[f"{uid}:{stage}"] = job
    return combined


async def get_job_history_all_users(limit: int = 50, offset: int = 0) -> list:
    """Aggregate recent job history across all users (newest first). Superuser-only."""
    r = _safe_get_redis()
    if r is None:
        return []
    try:
        keys = await r.keys(f"{_HISTORY_PREFIX}:*")
    except Exception as e:
        logger.warning(f"Pipeline tracker: failed to scan history keys: {e}")
        return []

    all_entries: list[tuple[float, dict]] = []
    for k in keys:
        key = k.decode() if isinstance(k, (bytes, bytearray)) else k
        try:
            entries = await r.zrevrangebyscore(key, "+inf", "-inf", withscores=True)
        except Exception:
            continue
        for raw, score in entries:
            try:
                all_entries.append((score, json.loads(raw)))
            except (json.JSONDecodeError, TypeError):
                continue

    all_entries.sort(key=lambda x: x[0], reverse=True)
    sliced = all_entries[offset: offset + limit]
    return [entry for _, entry in sliced]


async def is_stage_busy(user_id: int | str, stage: str) -> bool:
    """Check if a user's stage is currently queued or running."""
    r = _safe_get_redis()
    if r is None:
        return False
    active_map = await _load_map(r, user_id)
    job = active_map.get(stage)
    if not job:
        return False
    return job.get("status") in ("queued", "running")


# ── Internal ──────────────────────────────────────────────────────────────────

async def _finalize(user_id: int | str, stage: str, status: str, message: str) -> None:
    """Move a job from active map -> history sorted set, scoped to user."""
    r = _safe_get_redis()
    if r is None:
        logger.info(f"Pipeline tracker: user={user_id} {stage} -> {status} (Redis unavailable)")
        return
    active_map = await _load_map(r, user_id)

    now = datetime.now(timezone.utc)
    if stage in active_map:
        job = active_map[stage]
    else:
        job = {
            "stage": stage,
            "user_id": user_id,
            "status": status,
            "triggered_by": "unknown",
            "queued_at": now.isoformat(),
            "started_at": now.isoformat(),
            "logs": [],
        }

    job["status"] = status
    job["ended_at"] = now.isoformat()
    job["logs"].append(f"[{now.strftime('%H:%M:%S')}] {message}")

    try:
        score = time.time()
        hist_key = _history_key(user_id)
        await r.zadd(hist_key, {json.dumps(job): score})

        total = await r.zcard(hist_key)
        if total > MAX_HISTORY:
            await r.zremrangebyrank(hist_key, 0, total - MAX_HISTORY - 1)
    except Exception as e:
        logger.warning(f"Pipeline tracker: failed to archive history: {e}")

    active_map.pop(stage, None)
    await _save_map(r, user_id, active_map)
    logger.info(f"Pipeline tracker: user={user_id} {stage} -> {status}")
