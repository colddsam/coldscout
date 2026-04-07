"""
Pipeline Job Tracker — Per-stage run tracking via Redis.

Tracks each manually or automatically triggered pipeline stage with:
- Status: queued -> running -> completed / failed
- Timestamps for queued_at, started_at, ended_at
- Log messages per job run
- Persistent job history for the Pipeline Log UI

Redis key structure:
  pipeline:active_map   -> single JSON blob holding ALL active stage jobs
  pipeline:history      -> sorted set of completed run JSON blobs (score = timestamp)

The single-key design means get_active_jobs() is always 1 GET command,
regardless of how many stages are active. This keeps polling overhead
constant and avoids SCAN + N GET round-trips.
"""
import json
import time
from datetime import datetime, timezone
from loguru import logger

from app.core.redis_client import get_redis

# ── Keys ──────────────────────────────────────────────────────────────────────

ACTIVE_MAP_KEY = "pipeline:active_map"
HISTORY_KEY = "pipeline:history"
MAX_HISTORY = 200  # Keep last 200 job runs


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _load_map(r) -> dict:
    """Load the entire active-stages map from Redis (single GET)."""
    raw = await r.get(ACTIVE_MAP_KEY)
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


async def _save_map(r, active_map: dict) -> None:
    """Persist the active-stages map to Redis (single SET)."""
    if active_map:
        await r.set(ACTIVE_MAP_KEY, json.dumps(active_map))
    else:
        # No active jobs — delete the key to keep Redis clean
        await r.delete(ACTIVE_MAP_KEY)


# ── Public API ────────────────────────────────────────────────────────────────

async def enqueue_job(stage: str, triggered_by: str = "manual") -> dict:
    """Mark a stage as queued. Returns the job record."""
    r = get_redis()
    now = datetime.now(timezone.utc)
    job = {
        "stage": stage,
        "status": "queued",
        "triggered_by": triggered_by,
        "queued_at": now.isoformat(),
        "started_at": None,
        "ended_at": None,
        "logs": [f"[{now.strftime('%H:%M:%S')}] Job queued ({triggered_by})"],
    }
    active_map = await _load_map(r)
    active_map[stage] = job
    await _save_map(r, active_map)
    logger.info(f"Pipeline tracker: {stage} queued")
    return job


async def mark_running(stage: str) -> None:
    """Transition a stage from queued -> running."""
    r = get_redis()
    active_map = await _load_map(r)

    if stage not in active_map:
        # Job wasn't queued via tracker — create an entry anyway
        now = datetime.now(timezone.utc)
        active_map[stage] = {
            "stage": stage,
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
    await _save_map(r, active_map)
    logger.debug(f"Pipeline tracker: {stage} -> running")


async def append_log(stage: str, message: str) -> None:
    """Append a log line to the active job for a stage."""
    r = get_redis()
    active_map = await _load_map(r)
    if stage not in active_map:
        return
    job = active_map[stage]
    now = datetime.now(timezone.utc)
    job["logs"].append(f"[{now.strftime('%H:%M:%S')}] {message}")
    # Cap in-flight logs at 50 lines
    job["logs"] = job["logs"][-50:]
    active_map[stage] = job
    await _save_map(r, active_map)


async def mark_completed(stage: str, message: str = "Completed successfully") -> None:
    """Transition a stage to completed and archive to history."""
    await _finalize(stage, "completed", message)


async def mark_failed(stage: str, error: str = "Unknown error") -> None:
    """Transition a stage to failed and archive to history."""
    await _finalize(stage, "failed", error)


async def get_active_jobs() -> dict:
    """
    Return all currently active (queued/running) jobs keyed by stage.
    Single GET command — O(1) Redis operations regardless of stage count.
    """
    r = get_redis()
    return await _load_map(r)


async def get_job_history(limit: int = 50, offset: int = 0) -> list:
    """Return recent job history entries (newest first)."""
    r = get_redis()
    entries = await r.zrevrangebyscore(
        HISTORY_KEY, "+inf", "-inf",
        start=offset, num=limit
    )
    return [json.loads(e) for e in entries]


async def is_stage_busy(stage: str) -> bool:
    """Check if a stage is currently queued or running."""
    r = get_redis()
    active_map = await _load_map(r)
    job = active_map.get(stage)
    if not job:
        return False
    return job.get("status") in ("queued", "running")


# ── Internal ──────────────────────────────────────────────────────────────────

async def _finalize(stage: str, status: str, message: str) -> None:
    """Move a job from active map -> history sorted set."""
    r = get_redis()
    active_map = await _load_map(r)

    now = datetime.now(timezone.utc)
    if stage in active_map:
        job = active_map[stage]
    else:
        job = {
            "stage": stage,
            "status": status,
            "triggered_by": "unknown",
            "queued_at": now.isoformat(),
            "started_at": now.isoformat(),
            "logs": [],
        }

    job["status"] = status
    job["ended_at"] = now.isoformat()
    job["logs"].append(f"[{now.strftime('%H:%M:%S')}] {message}")

    # Archive to history sorted set (score = unix timestamp for ordering)
    score = time.time()
    await r.zadd(HISTORY_KEY, {json.dumps(job): score})

    # Trim history to MAX_HISTORY entries
    total = await r.zcard(HISTORY_KEY)
    if total > MAX_HISTORY:
        await r.zremrangebyrank(HISTORY_KEY, 0, total - MAX_HISTORY - 1)

    # Remove from active map and persist
    active_map.pop(stage, None)
    await _save_map(r, active_map)
    logger.info(f"Pipeline tracker: {stage} -> {status}")
