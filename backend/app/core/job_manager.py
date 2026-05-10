"""
Job configuration manager — DB-backed.

Responsibilities:
1. Read/write the authoritative global job schedule from ``global_job_configs``.
2. Resolve per-freelancer overrides from ``freelancer_job_configs``.
3. Expose a sync in-memory snapshot for APScheduler integration while all
   persistence happens via async SQLAlchemy.
4. Gate job execution through ``is_freelancer_pipeline_active`` which applies
   the full precedence ladder:

       Global PRODUCTION_STATUS  >  Global job status  >
       Freelancer pipeline HOLD  >  Per-freelancer job override
"""
from __future__ import annotations

import copy
import time
import os
from typing import Optional, Any
from loguru import logger

from app.config import get_settings, get_production_status

settings = get_settings()

# Jobs that run once per freelancer on the daily pipeline. Freelancer-level
# overrides on other jobs (e.g. ``weekly_optimization``) are tolerated but
# have no effective user_id check and are therefore informational only.
DAILY_PIPELINE_JOBS = {
    "discovery", "qualification", "personalization", "outreach",
    "reply_poll", "daily_report", "followup_dispatch",
    "threads_discovery", "threads_qualification",
    "threads_engagement", "threads_response_check",
}

# System-only jobs that never run per freelancer. UI hides per-freelancer
# toggle rows for these.
SYSTEM_ONLY_JOBS = {"weekly_optimization", "booking_reminders"}

# Hard-coded fallback — only used if the DB is unreachable at boot. Keep in
# sync with the Alembic seed list.
DEFAULT_JOBS_CONFIG: dict[str, dict] = {
    "discovery":             {"status": "RUN",  "type": "cron",     "hour": settings.DISCOVERY_HOUR,       "minute": 0},
    "qualification":         {"status": "RUN",  "type": "cron",     "hour": settings.QUALIFICATION_HOUR,   "minute": 0},
    "personalization":       {"status": "RUN",  "type": "cron",     "hour": settings.PERSONALIZATION_HOUR, "minute": 0},
    "outreach":              {"status": "RUN",  "type": "cron",     "hour": settings.OUTREACH_HOUR,        "minute": 0},
    "reply_poll":            {"status": "RUN",  "type": "interval", "minutes": 30},
    "daily_report":          {"status": "RUN",  "type": "cron",     "hour": settings.REPORT_HOUR,          "minute": settings.REPORT_MINUTE},
    "followup_dispatch":     {"status": "RUN",  "type": "cron",     "hour": 10, "minute": 0},
    "weekly_optimization":   {"status": "RUN",  "type": "cron",     "day_of_week": "sun", "hour": 11, "minute": 0},
    "threads_discovery":     {"status": "HOLD", "type": "cron",     "hour": 10, "minute": 0},
    "threads_qualification": {"status": "HOLD", "type": "cron",     "hour": 11, "minute": 0},
    "threads_engagement":    {"status": "HOLD", "type": "cron",     "hour": 12, "minute": 0},
    "threads_response_check":{"status": "HOLD", "type": "interval", "minutes": 30},
    "booking_reminders":     {"status": "RUN",  "type": "interval", "minutes": 15},
    "SYSTEM_GLOBAL_STATUS":  {"status": "RUN",  "type": "system"},
}


def _row_to_cfg(row) -> dict:
    cfg = {"status": (row.status or "RUN").upper(), "type": row.type or "cron"}
    if row.hour is not None:
        cfg["hour"] = row.hour
    if row.minute is not None:
        cfg["minute"] = row.minute
    if row.minutes is not None:
        cfg["minutes"] = row.minutes
    if row.day_of_week:
        cfg["day_of_week"] = row.day_of_week
    return cfg


class JobManager:
    """Static accessor for job config state. All persistence is async."""

    # Global config cache (job_id → cfg dict)
    _global_cache: dict[str, dict] = {}
    _global_cache_at: float = 0
    _global_cache_loaded: bool = False

    # Freelancer-specific caches
    # user_id -> (status, timestamp)
    _freelancer_status_cache: dict[int, tuple[str, float]] = {}
    # user_id -> (overrides, timestamp)
    _freelancer_overrides_cache: dict[int, tuple[dict[str, str], float]] = {}
    
    # Global status direct check cache (very short TTL)
    # "SYSTEM_GLOBAL_STATUS" -> (status, timestamp)
    _direct_status_cache: tuple[str, float] = ("RUN", 0)

    _CACHE_TTL = 10.0  # seconds for full config
    _FREELANCER_TTL = 30.0  # seconds for user-specific configs
    _DIRECT_TTL = 2.0  # seconds for real-time global status check

    # ────────────────────────────────────────────────────────────────
    # Global config — async persistence
    # ────────────────────────────────────────────────────────────────

    @classmethod
    async def refresh_global_cache(cls, force: bool = False) -> dict[str, dict]:
        """Reload ``global_job_configs`` from DB into the in-memory cache.

        Seeds the table from ``DEFAULT_JOBS_CONFIG`` if empty.
        Uses a 10s TTL unless ``force=True``.
        """
        now = time.monotonic()
        if not force and cls._global_cache_loaded:
            if now - cls._global_cache_at < cls._CACHE_TTL:
                return cls._global_cache

        import asyncio
        from sqlalchemy import select
        from sqlalchemy.exc import IntegrityError
        from app.core.database import get_session_maker
        from app.models.global_job_config import GlobalJobConfig

        try:
            # We use a strict timeout here to prevent the backend from hanging at boot 
            # if Supabase is slow or the connection is unstable.
            async with get_session_maker()() as db:
                async def _fetch():
                    # 1. Fetch existing rows
                    rows = (await db.execute(select(GlobalJobConfig))).scalars().all()
                    cache = {row.job_id: _row_to_cfg(row) for row in rows}

                    # 2. Check for missing jobs (first boot or new code versions)
                    missing_ids = [k for k in DEFAULT_JOBS_CONFIG.keys() if k not in cache]
                    
                    if missing_ids:
                        logger.info(f"Seeding/Backfilling {len(missing_ids)} missing job configs...")
                        for job_id in missing_ids:
                            cfg = DEFAULT_JOBS_CONFIG[job_id]
                            db.add(GlobalJobConfig(
                                job_id=job_id,
                                status=cfg.get("status", "RUN"),
                                type=cfg.get("type", "cron"),
                                hour=cfg.get("hour"),
                                minute=cfg.get("minute"),
                                minutes=cfg.get("minutes"),
                                day_of_week=cfg.get("day_of_week"),
                            ))
                        
                        try:
                            await db.commit()
                            # Re-fetch after commit to get all rows
                            rows = (await db.execute(select(GlobalJobConfig))).scalars().all()
                            cache = {row.job_id: _row_to_cfg(row) for row in rows}
                        except IntegrityError:
                            # Another worker beat us to it.
                            await db.rollback()
                            rows = (await db.execute(select(GlobalJobConfig))).scalars().all()
                            cache = {row.job_id: _row_to_cfg(row) for row in rows}
                    return cache

                cache = await asyncio.wait_for(_fetch(), timeout=5.0)
                cls._global_cache = cache
                cls._global_cache_loaded = True
                cls._global_cache_at = now
                return copy.deepcopy(cache)

        except (asyncio.TimeoutError, Exception) as exc:
            if isinstance(exc, asyncio.TimeoutError):
                logger.warning("Global job config refresh timed out (5s). Using fallback.")
            else:
                logger.error(f"Failed to refresh global job config cache: {exc}")
            
            # If we've NEVER successfully loaded, use hard-coded fallbacks.
            # Otherwise, keep the stale cache.
            if not cls._global_cache_loaded:
                cls._global_cache = copy.deepcopy(DEFAULT_JOBS_CONFIG)
                cls._global_cache_loaded = True
                cls._global_cache_at = now
            return copy.deepcopy(cls._global_cache)

    @classmethod
    def load_config(cls, force_reload: bool = False) -> dict[str, dict]:
        """Sync accessor used by the scheduler. Returns the cached snapshot.

        Returns a reference to the cache for performance. Callers MUST NOT
        mutate the returned dictionary.
        """
        if not cls._global_cache_loaded and not cls._global_cache:
            # Cold-path fallback.
            return DEFAULT_JOBS_CONFIG
        return cls._global_cache

    @classmethod
    async def save_global_config(
        cls,
        updates: dict[str, dict],
        updated_by: Optional[int] = None,
    ) -> dict[str, dict]:
        """Apply a merge-patch to ``global_job_configs``.

        Validation is the caller's responsibility — the API layer already
        rejects malformed payloads. Rows for unknown ``job_id`` values are
        ignored so clients cannot create phantom jobs.
        """
        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.global_job_config import GlobalJobConfig

        async with get_session_maker()() as db:
            rows = (await db.execute(select(GlobalJobConfig))).scalars().all()
            by_id = {r.job_id: r for r in rows}

            for job_id, patch in updates.items():
                row = by_id.get(job_id)
                if not row or not isinstance(patch, dict):
                    continue
                if "status" in patch:
                    row.status = str(patch["status"]).upper()
                if "type" in patch:
                    row.type = patch["type"]
                if "hour" in patch:
                    row.hour = patch["hour"]
                if "minute" in patch:
                    row.minute = patch["minute"]
                if "minutes" in patch:
                    row.minutes = patch["minutes"]
                if "day_of_week" in patch:
                    row.day_of_week = patch["day_of_week"]
                if updated_by is not None:
                    row.updated_by = updated_by

            await db.commit()
            # If we updated the global status, update the direct cache immediately
            if "SYSTEM_GLOBAL_STATUS" in updates:
                new_status = str(updates["SYSTEM_GLOBAL_STATUS"].get("status", "RUN")).upper()
                cls._direct_status_cache = (new_status, time.monotonic())

        return await cls.refresh_global_cache(force=True)

    # ────────────────────────────────────────────────────────────────
    # Freelancer pipeline-level status (existing model)
    # ────────────────────────────────────────────────────────────────

    @classmethod
    async def get_freelancer_production_status(cls, user_id: int) -> str:
        """Returns 'RUN' or 'HOLD' for a specific freelancer, with TTL caching."""
        now = time.monotonic()
        cached = cls._freelancer_status_cache.get(user_id)
        if cached and (now - cached[1]) < cls._FREELANCER_TTL:
            return cached[0]

        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.freelancer_pipeline_config import FreelancerPipelineConfig

        try:
            async with get_session_maker()() as db:
                res = await db.execute(
                    select(FreelancerPipelineConfig.production_status)
                    .where(FreelancerPipelineConfig.user_id == user_id)
                )
                status = (res.scalar() or "RUN").upper()
                cls._freelancer_status_cache[user_id] = (status, now)
                return status
        except Exception as e:
            logger.warning(f"Failed to fetch production status for user {user_id}: {e}")
            return "RUN"

    @classmethod
    async def set_freelancer_production_status(cls, user_id: int, status: str) -> dict:
        from sqlalchemy.dialects.postgresql import insert
        from app.core.database import get_session_maker
        from app.models.freelancer_pipeline_config import FreelancerPipelineConfig

        normalized = status.upper()
        async with get_session_maker()() as db:
            stmt = (
                insert(FreelancerPipelineConfig)
                .values(user_id=user_id, production_status=normalized)
                .on_conflict_do_update(
                    index_elements=["user_id"],
                    set_={"production_status": normalized},
                )
            )
            await db.execute(stmt)
            await db.commit()
        cls._freelancer_status_cache[user_id] = (normalized, time.monotonic())
        return {"user_id": user_id, "production_status": normalized}

    @classmethod
    async def ensure_freelancer_config(cls, user_id: int) -> None:
        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.freelancer_pipeline_config import FreelancerPipelineConfig

        async with get_session_maker()() as db:
            res = await db.execute(
                select(FreelancerPipelineConfig)
                .where(FreelancerPipelineConfig.user_id == user_id)
            )
            if not res.scalars().first():
                db.add(FreelancerPipelineConfig(user_id=user_id, production_status="RUN"))
                await db.commit()

    @classmethod
    async def get_active_freelancers(cls) -> list[int]:
        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.user import User
        from app.models.freelancer_pipeline_config import FreelancerPipelineConfig

        async with get_session_maker()() as db:
            res = await db.execute(
                select(User.id).where(User.role == "freelancer", User.is_active == True)  # noqa: E712
            )
            all_ids = [r[0] for r in res.all()]
            if not all_ids:
                return []
            hold_res = await db.execute(
                select(FreelancerPipelineConfig.user_id)
                .where(FreelancerPipelineConfig.production_status == "HOLD")
            )
            held = {r[0] for r in hold_res.all()}
            return [uid for uid in all_ids if uid not in held]

    # ────────────────────────────────────────────────────────────────
    # Per-freelancer per-job override
    # ────────────────────────────────────────────────────────────────

    @classmethod
    async def get_freelancer_job_overrides(
        cls, user_id: int, use_cache: bool = True
    ) -> dict[str, str]:
        """Return ``{job_id: 'RUN'|'HOLD'}`` for the given user, with TTL caching."""
        now = time.monotonic()
        if use_cache:
            cached = cls._freelancer_overrides_cache.get(user_id)
            if cached and (now - cached[1]) < cls._FREELANCER_TTL:
                return dict(cached[0])

        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.freelancer_job_config import FreelancerJobConfig

        try:
            async with get_session_maker()() as db:
                res = await db.execute(
                    select(FreelancerJobConfig.job_id, FreelancerJobConfig.status)
                    .where(FreelancerJobConfig.user_id == user_id)
                )
                overrides = {row[0]: (row[1] or "RUN").upper() for row in res.all()}
                cls._freelancer_overrides_cache[user_id] = (overrides, now)
                return dict(overrides)
        except Exception as e:
            logger.warning(f"Failed to fetch job overrides for user {user_id}: {e}")
            return {}

    @classmethod
    def invalidate_freelancer_cache(cls, user_id: Optional[int] = None) -> None:
        if user_id is None:
            cls._freelancer_status_cache.clear()
            cls._freelancer_overrides_cache.clear()
        else:
            cls._freelancer_status_cache.pop(user_id, None)
            cls._freelancer_overrides_cache.pop(user_id, None)

    @classmethod
    async def set_freelancer_job_override(
        cls, user_id: int, job_id: str, status: str
    ) -> dict:
        """Upsert ``freelancer_job_configs`` and return the effective view."""
        from sqlalchemy.dialects.postgresql import insert
        from app.core.database import get_session_maker
        from app.models.freelancer_job_config import FreelancerJobConfig

        global_cache = cls.load_config()
        if job_id not in global_cache:
            raise ValueError(f"Unknown job_id '{job_id}'")
        if job_id in SYSTEM_ONLY_JOBS:
            raise ValueError(f"Job '{job_id}' is system-only and cannot be overridden per freelancer")

        normalized = status.upper()
        if normalized not in ("RUN", "HOLD"):
            raise ValueError("status must be RUN or HOLD")

        async with get_session_maker()() as db:
            # Use PostgreSQL native ON CONFLICT to prevent race condition during INSERT
            stmt = (
                insert(FreelancerJobConfig)
                .values(user_id=user_id, job_id=job_id, status=normalized)
                .on_conflict_do_update(
                    constraint="uq_freelancer_job_configs_user_job",
                    set_={"status": normalized},
                )
            )
            await db.execute(stmt)
            await db.commit()

        cls.invalidate_freelancer_cache(user_id)
        return {"user_id": user_id, "job_id": job_id, "status": normalized}

    # ────────────────────────────────────────────────────────────────
    # Gate checks
    # ────────────────────────────────────────────────────────────────

    @classmethod
    def is_global_active(cls) -> bool:
        """Returns True if the global pipeline kill-switch is set to RUN.
        
        Uses the shared 10s TTL cache. For near-real-time checks in tasks,
        use ``await is_global_active_direct()``.
        """
        cfg = cls.load_config().get("SYSTEM_GLOBAL_STATUS", {})
        return str(cfg.get("status", "RUN")).upper() == "RUN"

    @classmethod
    async def is_global_active_direct(cls) -> bool:
        """Fast-path check that hits the DB directly with a very short TTL (2s).
        
        This satisfies the requirement to recover quickly from 'HOLD' without
        waiting for the full 10s cache refresh or reloading the entire config.
        """
        now = time.monotonic()
        if (now - cls._direct_status_cache[1]) < cls._DIRECT_TTL:
            return cls._direct_status_cache[0] == "RUN"

        from sqlalchemy import select, text
        from app.core.database import get_session_maker
        from app.models.global_job_config import GlobalJobConfig

        try:
            import asyncio
            async with get_session_maker()() as db:
                async def _fetch():
                    # Targeted single-row fetch
                    res = await db.execute(
                        select(GlobalJobConfig.status)
                        .where(GlobalJobConfig.job_id == "SYSTEM_GLOBAL_STATUS")
                    )
                    return (res.scalar() or "RUN").upper()

                status = await asyncio.wait_for(_fetch(), timeout=2.0)
                cls._direct_status_cache = (status, now)
                return status == "RUN"
        except (asyncio.TimeoutError, Exception) as e:
            if not isinstance(e, asyncio.TimeoutError):
                logger.warning(f"Direct global status check failed: {e}")
            return cls.is_global_active()

    @classmethod
    def is_job_active(cls, job_id: str, ignore_global_hold: bool = False) -> bool:
        """Sync gate — global PRODUCTION + global job status only."""
        if not ignore_global_hold and not cls.is_global_active():
            return False
        cfg = cls.load_config().get(job_id, {})
        return str(cfg.get("status", "RUN")).upper() == "RUN"

    @classmethod
    async def is_freelancer_pipeline_active(
        cls,
        job_id: str,
        user_id: Optional[int] = None,
        is_manual: bool = False,
    ) -> bool:
        """Full precedence gate used by every pipeline entry point.

        Precedence (first HOLD wins):
          1. Global SYSTEM_GLOBAL_STATUS = HOLD → block (daily + manual).
          2. Global job status = HOLD → block (daily + manual).
          3. Freelancer pipeline production_status = HOLD + daily run → block.
             (Manual triggers bypass freelancer pipeline HOLD so the user
             can still run ad-hoc work while paused.)
          4. Per-freelancer job override = HOLD → block (daily + manual).
             The freelancer has explicitly silenced that job for themselves.
        """
        if not cls.is_global_active():
            return False

        cfg = cls.load_config().get(job_id, {})
        if str(cfg.get("status", "RUN")).upper() == "HOLD":
            return False

        if user_id is None:
            return True

        if job_id in DAILY_PIPELINE_JOBS and not is_manual:
            pipeline_status = await cls.get_freelancer_production_status(user_id)
            if pipeline_status == "HOLD":
                return False

        if job_id not in SYSTEM_ONLY_JOBS:
            overrides = await cls.get_freelancer_job_overrides(user_id)
            if overrides.get(job_id, "RUN").upper() == "HOLD":
                return False

        return True


job_manager = JobManager()
