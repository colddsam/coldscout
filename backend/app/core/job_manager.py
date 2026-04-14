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
from typing import Optional

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
SYSTEM_ONLY_JOBS = {"weekly_optimization"}

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
    _global_cache_loaded: bool = False

    # Freelancer overrides cache (user_id → {job_id: status})
    _freelancer_cache: dict[int, dict[str, str]] = {}
    _freelancer_cache_at: dict[int, float] = {}
    _FREELANCER_CACHE_TTL = 15.0  # seconds

    # ────────────────────────────────────────────────────────────────
    # Global config — async persistence
    # ────────────────────────────────────────────────────────────────

    @classmethod
    async def refresh_global_cache(cls) -> dict[str, dict]:
        """Reload ``global_job_configs`` from DB into the in-memory cache.

        Seeds the table from ``DEFAULT_JOBS_CONFIG`` if empty so newly
        provisioned environments pick up sane defaults on first boot.
        """
        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.global_job_config import GlobalJobConfig

        try:
            async with get_session_maker()() as db:
                rows = (await db.execute(select(GlobalJobConfig))).scalars().all()

                if not rows:
                    # First boot — seed the table from hard-coded defaults.
                    from sqlalchemy.exc import IntegrityError
                    try:
                        for job_id, cfg in DEFAULT_JOBS_CONFIG.items():
                            db.add(GlobalJobConfig(
                                job_id=job_id,
                                status=cfg.get("status", "RUN"),
                                type=cfg.get("type", "cron"),
                                hour=cfg.get("hour"),
                                minute=cfg.get("minute"),
                                minutes=cfg.get("minutes"),
                                day_of_week=cfg.get("day_of_week"),
                            ))
                        await db.commit()
                    except IntegrityError:
                        # Another worker seeded the table while we were working.
                        # Swallowing and rolling back this attempt.
                        await db.rollback()

                    rows = (await db.execute(select(GlobalJobConfig))).scalars().all()

                cache = {row.job_id: _row_to_cfg(row) for row in rows}

            # Backfill any missing default jobs (e.g. a new job_id was added
            # in code after initial seed). We do not overwrite existing
            # operator-tuned rows.
            missing = {k: v for k, v in DEFAULT_JOBS_CONFIG.items() if k not in cache}
            if missing:
                async with get_session_maker()() as db:
                    for job_id, cfg in missing.items():
                        db.add(GlobalJobConfig(
                            job_id=job_id,
                            status=cfg.get("status", "RUN"),
                            type=cfg.get("type", "cron"),
                            hour=cfg.get("hour"),
                            minute=cfg.get("minute"),
                            minutes=cfg.get("minutes"),
                            day_of_week=cfg.get("day_of_week"),
                        ))
                    await db.commit()
                cache.update(copy.deepcopy(missing))

            cls._global_cache = cache
            cls._global_cache_loaded = True
            return cache
        except Exception as exc:
            logger.error(f"Failed to refresh global job config cache: {exc}")
            if not cls._global_cache_loaded:
                cls._global_cache = copy.deepcopy(DEFAULT_JOBS_CONFIG)
            return cls._global_cache

    @classmethod
    def load_config(cls, force_reload: bool = False) -> dict[str, dict]:
        """Sync accessor used by the scheduler. Returns the cached snapshot.

        ``force_reload`` is accepted for backwards compatibility but only
        surfaces already-loaded cache — callers wanting fresh data must
        ``await refresh_global_cache()`` first.
        """
        if not cls._global_cache_loaded and not cls._global_cache:
            # Cold-path fallback. The async bootstrap runs during app startup
            # so this only fires in tests / misconfigurations.
            cls._global_cache = copy.deepcopy(DEFAULT_JOBS_CONFIG)
        return copy.deepcopy(cls._global_cache)

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

        return await cls.refresh_global_cache()

    # ────────────────────────────────────────────────────────────────
    # Freelancer pipeline-level status (existing model)
    # ────────────────────────────────────────────────────────────────

    @classmethod
    async def get_freelancer_production_status(cls, user_id: int) -> str:
        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.freelancer_pipeline_config import FreelancerPipelineConfig

        async with get_session_maker()() as db:
            res = await db.execute(
                select(FreelancerPipelineConfig.production_status)
                .where(FreelancerPipelineConfig.user_id == user_id)
            )
            return (res.scalar() or "RUN").upper()

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
        """Return ``{job_id: 'RUN'|'HOLD'}`` for the given user."""
        now = time.monotonic()
        if use_cache:
            cached_at = cls._freelancer_cache_at.get(user_id, 0)
            if now - cached_at < cls._FREELANCER_CACHE_TTL and user_id in cls._freelancer_cache:
                return dict(cls._freelancer_cache[user_id])

        from sqlalchemy import select
        from app.core.database import get_session_maker
        from app.models.freelancer_job_config import FreelancerJobConfig

        async with get_session_maker()() as db:
            res = await db.execute(
                select(FreelancerJobConfig.job_id, FreelancerJobConfig.status)
                .where(FreelancerJobConfig.user_id == user_id)
            )
            overrides = {row[0]: (row[1] or "RUN").upper() for row in res.all()}

        cls._freelancer_cache[user_id] = overrides
        cls._freelancer_cache_at[user_id] = now
        return dict(overrides)

    @classmethod
    def invalidate_freelancer_cache(cls, user_id: Optional[int] = None) -> None:
        if user_id is None:
            cls._freelancer_cache.clear()
            cls._freelancer_cache_at.clear()
        else:
            cls._freelancer_cache.pop(user_id, None)
            cls._freelancer_cache_at.pop(user_id, None)

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
    def is_job_active(cls, job_id: str, ignore_global_hold: bool = False) -> bool:
        """Sync gate — global PRODUCTION + global job status only."""
        if not ignore_global_hold and get_production_status() == "HOLD":
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
          1. Global PRODUCTION_STATUS = HOLD → block (daily + manual).
          2. Global job status = HOLD → block (daily + manual).
          3. Freelancer pipeline production_status = HOLD + daily run → block.
             (Manual triggers bypass freelancer pipeline HOLD so the user
             can still run ad-hoc work while paused.)
          4. Per-freelancer job override = HOLD → block (daily + manual).
             The freelancer has explicitly silenced that job for themselves.
        """
        if get_production_status() == "HOLD":
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
