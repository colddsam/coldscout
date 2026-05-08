"""
AI Lead Generation System - Pipeline Orchestration API

This module provides the administrative interface for controlling the autonomous
lead generation pipeline. It enables manual overrides, runtime status tracking,
and global system flow control.

Key Features:
1. Manual Triggering: Allows on-demand execution of specific pipeline stages.
2. Global Kill-Switch: Features 'hold' and 'resume' functionality via environment mutation.
3. Scheduler Transparency: Provides visibility into APScheduler's active job pool.
4. Dynamic Configuration: Enables patching of cron-based schedules without service restarts.
"""
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from datetime import datetime, timezone
from pydantic import BaseModel
from loguru import logger
from sqlalchemy import select
from app.core.database import get_session_maker
from app.models.daily_report import DailyReport
from app.tasks.daily_pipeline import (
    run_discovery_stage,
    run_qualification_stage,
    run_personalization_stage,
    run_outreach_stage,
    generate_daily_report
)
from app.modules.analytics.performance_analyzer import run_weekly_optimization
from app.core.scheduler import scheduler
from app.core.pipeline_tracker import (
    enqueue_job, get_active_jobs, get_job_history,
    get_active_jobs_all_users, get_job_history_all_users,
)
from app.core.job_queue import enqueue as enqueue_queue, register_stage

from app.api.deps import get_current_active_superuser, get_current_user
from app.models.user import User

router = APIRouter()

from app.tasks.threads_pipeline import (
    run_threads_discovery_stage,
    run_threads_qualification_stage,
    run_threads_engagement_stage,
    run_threads_response_check
)

class TriggerRequest(BaseModel):
    stage: str
    dry_run: bool = False

STAGE_FUNCTIONS = {
    "discovery": run_discovery_stage,
    "qualification": run_qualification_stage,
    "personalization": run_personalization_stage,
    "outreach": run_outreach_stage,
    "daily_report": generate_daily_report,
    "weekly_optimization": run_weekly_optimization,
    "threads_discovery": run_threads_discovery_stage,
    "threads_qualification": run_threads_qualification_stage,
    "threads_engagement": run_threads_engagement_stage,
    "threads_response_check": run_threads_response_check,
}

ALL_PIPELINE_STAGES = [
    "discovery", "qualification", "personalization", "outreach", "daily_report"
]

# Stages that support the multi-freelancer (manual + user_id kwargs) signature.
# Used to register them with the shared ``job_queue`` consumer.
_FREELANCER_AWARE_STAGES = {
    "discovery", "qualification", "personalization", "outreach",
    "daily_report", "reply_poll",
    "threads_discovery", "threads_qualification",
    "threads_engagement", "threads_response_check",
}

# Register every stage with the shared queue. Any module (including
# ``app/api/v1/leads.py``) can now look stages up by name and push jobs onto
# the same single-worker queue, ensuring system-wide serial execution.
for _stage_name, _stage_func in STAGE_FUNCTIONS.items():
    register_stage(
        _stage_name,
        _stage_func,
        freelancer_aware=_stage_name in _FREELANCER_AWARE_STAGES,
    )


@router.post("/pipeline/trigger")
async def trigger_pipeline(
    request: TriggerRequest = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers pipeline stage(s) for manual execution via a serial job queue.
    
    Authorization:
    Allowed for 'superuser' OR 'freelancer' role.
    """
    if not current_user.is_superuser and current_user.role != "freelancer":
        raise HTTPException(
            status_code=403, 
            detail="The user doesn't have enough privileges to trigger pipeline jobs"
        )
    """
    Triggers pipeline stage(s) for manual execution via a serial job queue.

    Jobs are enqueued immediately (shown as "queued" in UI) and processed
    one at a time. If a job is already running, new jobs wait in the queue.
    The response includes the current active_stages snapshot so the frontend
    can update instantly without waiting for the next poll.
    """
    if request.stage == "all":
        stages_to_run = ALL_PIPELINE_STAGES
    elif request.stage in STAGE_FUNCTIONS:
        stages_to_run = [request.stage]
    else:
        raise HTTPException(status_code=400, detail="Invalid stage specified")

    triggered = []
    for stage_name in stages_to_run:
        await enqueue_job(current_user.id, stage_name, triggered_by="manual")
        stage_func = STAGE_FUNCTIONS[stage_name]
        await enqueue_queue(stage_name, stage_func, True, current_user.id)
        triggered.append(stage_name)

    # Return a snapshot of this user's active stages so the UI updates instantly
    active_stages = await get_active_jobs(current_user.id)

    return {
        "status": "triggered",
        "stage": request.stage,
        "stages": triggered,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "active_stages": active_stages,
    }

@router.get("/pipeline/status")
async def pipeline_status(current_user: User = Depends(get_current_user)):
    """
    Retrieves the holistic system status including per-stage active job tracking.
    Scoped to the current user's report data.
    """
    async with get_session_maker()() as db:
        stmt = select(DailyReport).order_by(DailyReport.report_date.desc()).limit(1)
        if not current_user.is_superuser:
            stmt = stmt.where(DailyReport.user_id == current_user.id)
        res = await db.execute(stmt)
        latest_report = res.scalars().first()

    last_run = None
    if latest_report:
        last_run = {
            "stage": latest_report.pipeline_status,
            "status": latest_report.pipeline_status,
            "at": latest_report.pipeline_ended_at.isoformat() if latest_report.pipeline_ended_at else (
                  latest_report.pipeline_started_at.isoformat() if latest_report.pipeline_started_at else None)
        }

    jobs = []
    if scheduler.running:
        for job in scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None
            })

    # Per-stage active job tracking. Superusers see every freelancer's
    # active jobs; everyone else only sees their own.
    active_stages = {}
    try:
        if current_user.is_superuser:
            active_stages = await get_active_jobs_all_users()
        else:
            active_stages = await get_active_jobs(current_user.id)
    except Exception as e:
        logger.warning(f"Failed to fetch active jobs from Redis: {e}")

    return {
        "last_run": last_run,
        "scheduler_running": scheduler.running,
        "jobs": jobs,
        "active_stages": active_stages,
    }


@router.get("/pipeline/history")
async def pipeline_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user_id: int | None = Query(None, description="Superuser-only: view another user's history"),
    current_user: User = Depends(get_current_user),
):
    """
    Returns persistent job run history for the Pipeline Log UI, scoped to the
    current user. Superusers may pass ?user_id= to inspect another user's
    history; all other callers always see only their own runs.
    """
    # Superuser with no explicit user_id filter -> aggregate across all users.
    if current_user.is_superuser and user_id is None:
        try:
            history = await get_job_history_all_users(limit=limit, offset=offset)
            return {"history": history, "limit": limit, "offset": offset, "user_id": None}
        except Exception as e:
            logger.error(f"Failed to fetch pipeline history (all users): {e}")
            return {"history": [], "limit": limit, "offset": offset, "user_id": None}

    target_user_id = current_user.id
    if user_id is not None and user_id != current_user.id:
        if not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Cannot view another user's history")
        target_user_id = user_id

    try:
        history = await get_job_history(target_user_id, limit=limit, offset=offset)
        return {"history": history, "limit": limit, "offset": offset, "user_id": target_user_id}
    except Exception as e:
        logger.error(f"Failed to fetch pipeline history: {e}")
        return {"history": [], "limit": limit, "offset": offset, "user_id": target_user_id}

@router.post("/pipeline/hold", dependencies=[Depends(get_current_active_superuser)])
async def hold_pipeline():
    """
    Sets PRODUCTION_STATUS=HOLD at runtime as a global pipeline kill-switch.

    Updates os.environ for immediate in-process effect and pauses all
    APScheduler jobs instantly. The .env file is also updated as a
    best-effort persistence mechanism for local development.
    """
    try:
        from app.config import set_env_variable
        set_env_variable("PRODUCTION_STATUS", "HOLD")

        for job in scheduler.get_jobs():
            if job.id != "scheduler_sync":
                scheduler.pause_job(job.id)

        logger.info("🚨 Pipeline HELD — all jobs paused immediately via API.")
        return {"status": "held"}
    except Exception as e:
        logger.error(f"Failed to hold pipeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to hold pipeline")

@router.post("/pipeline/resume", dependencies=[Depends(get_current_active_superuser)])
async def resume_pipeline():
    """
    Sets PRODUCTION_STATUS=RUN at runtime to resume pipeline execution.

    Updates os.environ for immediate in-process effect and resumes all
    APScheduler jobs that are configured as RUN in jobs_config.json.
    """
    try:
        from app.config import set_env_variable
        from app.core.job_manager import job_manager
        set_env_variable("PRODUCTION_STATUS", "RUN")

        for job in scheduler.get_jobs():
            if job.id != "scheduler_sync" and job_manager.is_job_active(job.id):
                scheduler.resume_job(job.id)

        logger.info("✅ Pipeline RESUMED — active jobs resumed immediately via API.")
        return {"status": "running"}
    except Exception as e:
        logger.error(f"Failed to resume pipeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to resume pipeline")


from app.core.job_manager import job_manager


@router.get("/pipeline/jobs_config")
async def get_jobs_config():
    """Returns the authoritative DB-backed global job configuration."""
    return await job_manager.refresh_global_cache()


@router.patch("/pipeline/jobs_config")
async def update_jobs_config(
    config_updates: dict = Body(...),
    current_user: User = Depends(get_current_active_superuser),
):
    """Superuser merge-patch against ``global_job_configs``.

    Guardrail: the superuser cannot retune or re-enable jobs while the
    global ``PRODUCTION_STATUS`` is HOLD. Resume production first, then
    edit — this mirrors the UX contract requested by operators.
    """
    from app.config import get_production_status

    if get_production_status() == "HOLD":
        raise HTTPException(
            status_code=409,
            detail="PRODUCTION_STATUS is HOLD. Resume the pipeline before editing the global job configuration.",
        )

    current_config = job_manager.load_config()

    sanitized: dict[str, dict] = {}
    for job_id, updates in config_updates.items():
        if job_id not in current_config or not isinstance(updates, dict):
            continue

        cleaned: dict = {}
        for field, val in updates.items():
            if field == "status":
                if str(val).upper() not in ("RUN", "HOLD"):
                    raise HTTPException(status_code=422, detail=f"Invalid status '{val}' for {job_id}. Must be RUN or HOLD.")
                cleaned["status"] = str(val).upper()
            elif field == "hour":
                if not isinstance(val, int) or not (0 <= val <= 23):
                    raise HTTPException(status_code=422, detail=f"Invalid hour '{val}' for {job_id}. Must be 0-23.")
                cleaned["hour"] = val
            elif field in ("minute", "minutes"):
                if not isinstance(val, int) or not (0 <= val <= 59):
                    raise HTTPException(status_code=422, detail=f"Invalid {field} '{val}' for {job_id}. Must be 0-59.")
                cleaned[field] = val
            elif field == "day_of_week":
                if str(val).lower() not in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
                    raise HTTPException(status_code=422, detail=f"Invalid day_of_week '{val}' for {job_id}.")
                cleaned["day_of_week"] = str(val).lower()
            elif field == "type":
                if val not in ("cron", "interval"):
                    raise HTTPException(status_code=422, detail=f"Invalid type '{val}' for {job_id}.")
                cleaned["type"] = val

        if cleaned:
            sanitized[job_id] = cleaned

    new_config = await job_manager.save_global_config(sanitized, updated_by=current_user.id)

    return {
        "status": "success",
        "message": "Configuration updated successfully. APScheduler will sync within 60 seconds.",
        "config": new_config,
    }


# ── Per-freelancer job overrides ─────────────────────────────────────────────

from app.models.freelancer_job_config import FreelancerJobConfig
from app.core.job_manager import SYSTEM_ONLY_JOBS


class FreelancerJobConfigUpdate(BaseModel):
    status: str  # 'RUN' or 'HOLD'


def _merge_effective(
    global_config: dict[str, dict],
    overrides: dict[str, str],
    global_production_status: str,
) -> list[dict]:
    """Compute the per-job effective view for a freelancer."""
    out: list[dict] = []
    for job_id, cfg in global_config.items():
        global_status = str(cfg.get("status", "RUN")).upper()
        override = overrides.get(job_id, "RUN").upper()

        if global_production_status == "HOLD":
            effective = "HOLD"
        elif global_status == "HOLD":
            effective = "HOLD"
        elif job_id in SYSTEM_ONLY_JOBS:
            effective = global_status
        else:
            effective = "HOLD" if override == "HOLD" else "RUN"

        out.append({
            "job_id": job_id,
            "type": cfg.get("type"),
            "hour": cfg.get("hour"),
            "minute": cfg.get("minute"),
            "minutes": cfg.get("minutes"),
            "day_of_week": cfg.get("day_of_week"),
            "global_status": global_status,
            "freelancer_status": override,
            "effective_status": effective,
            "system_only": job_id in SYSTEM_ONLY_JOBS,
        })
    return out


@router.get("/pipeline/my-job-config")
async def get_my_job_config(current_user: User = Depends(get_current_user)):
    """Freelancer-facing merged view of every job with effective status."""
    from app.config import get_production_status as _prod

    global_config = await job_manager.refresh_global_cache()
    overrides = await job_manager.get_freelancer_job_overrides(current_user.id, use_cache=False)
    prod = _prod()

    return {
        "user_id": current_user.id,
        "global_production_status": prod,
        "jobs": _merge_effective(global_config, overrides, prod),
    }


@router.patch("/pipeline/my-job-config")
async def update_my_job_config(
    updates: dict = Body(..., description="Map of {job_id: 'RUN'|'HOLD'}"),
    current_user: User = Depends(get_current_user),
):
    """Freelancer sets their own per-job overrides.

    Rejects attempts to override a job that is globally HOLD (nothing to
    override — the job is off for everyone) or while production is HOLD.
    """
    from app.config import get_production_status as _prod

    if _prod() == "HOLD":
        raise HTTPException(
            status_code=409,
            detail="PRODUCTION_STATUS is HOLD. Wait for the administrator to resume the pipeline.",
        )

    if current_user.role != "freelancer" and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Only freelancers can manage personal job overrides.")

    global_config = job_manager.load_config()

    for job_id, status in updates.items():
        if job_id not in global_config:
            raise HTTPException(status_code=422, detail=f"Unknown job '{job_id}'")
        if job_id in SYSTEM_ONLY_JOBS:
            raise HTTPException(status_code=422, detail=f"Job '{job_id}' cannot be overridden per freelancer.")
        if str(global_config[job_id].get("status", "RUN")).upper() == "HOLD":
            raise HTTPException(
                status_code=409,
                detail=f"Job '{job_id}' is globally HOLD. Ask the administrator to enable it first.",
            )
        if str(status).upper() not in ("RUN", "HOLD"):
            raise HTTPException(status_code=422, detail=f"Invalid status '{status}' for {job_id}. Must be RUN or HOLD.")

    for job_id, status in updates.items():
        await job_manager.set_freelancer_job_override(current_user.id, job_id, status)

    overrides = await job_manager.get_freelancer_job_overrides(current_user.id, use_cache=False)
    return {
        "user_id": current_user.id,
        "global_production_status": _prod(),
        "jobs": _merge_effective(global_config, overrides, _prod()),
    }


@router.get(
    "/pipeline/freelancer-job-config/{target_user_id}",
    dependencies=[Depends(get_current_active_superuser)],
)
async def admin_get_freelancer_job_config(target_user_id: int):
    """Superuser view of a specific freelancer's overrides."""
    from app.config import get_production_status as _prod

    global_config = await job_manager.refresh_global_cache()
    overrides = await job_manager.get_freelancer_job_overrides(target_user_id, use_cache=False)

    return {
        "user_id": target_user_id,
        "global_production_status": _prod(),
        "jobs": _merge_effective(global_config, overrides, _prod()),
    }


@router.patch(
    "/pipeline/freelancer-job-config/{target_user_id}",
    dependencies=[Depends(get_current_active_superuser)],
)
async def admin_update_freelancer_job_config(
    target_user_id: int,
    updates: dict = Body(..., description="Map of {job_id: 'RUN'|'HOLD'}"),
):
    """Superuser sets overrides on behalf of a freelancer."""
    from app.config import get_production_status as _prod

    global_config = job_manager.load_config()

    for job_id, status in updates.items():
        if job_id not in global_config:
            raise HTTPException(status_code=422, detail=f"Unknown job '{job_id}'")
        if job_id in SYSTEM_ONLY_JOBS:
            raise HTTPException(status_code=422, detail=f"Job '{job_id}' cannot be overridden per freelancer.")
        if str(status).upper() not in ("RUN", "HOLD"):
            raise HTTPException(status_code=422, detail=f"Invalid status '{status}' for {job_id}. Must be RUN or HOLD.")

    for job_id, status in updates.items():
        await job_manager.set_freelancer_job_override(target_user_id, job_id, status)

    overrides = await job_manager.get_freelancer_job_overrides(target_user_id, use_cache=False)
    return {
        "user_id": target_user_id,
        "global_production_status": _prod(),
        "jobs": _merge_effective(global_config, overrides, _prod()),
    }


# ── Per-freelancer notification preferences ──────────────────────────────────
#
# Per-user, per-job toggles for stage-event notifications. Strict isolation:
# every endpoint reads / writes ONLY ``current_user.id``'s rows so user A's
# preference cannot affect user B. Defaults to ENABLED for all governed
# stages when no row exists, matching the historical behaviour.

from app.modules.notifications.preferences import (
    GOVERNED_STAGES,
    get_user_preferences,
    set_user_preference,
)


class NotificationPrefsUpdate(BaseModel):
    """Map of ``{job_id: bool}`` — True enables notifications, False silences them."""

    prefs: dict[str, bool]


@router.get("/pipeline/my-notification-config")
async def get_my_notification_config(
    current_user: User = Depends(get_current_user),
):
    """Return the calling freelancer's per-job notification preferences.

    Strict per-user scoping: only ``current_user.id``'s rows are read.
    Missing rows default to ``True`` (notifications enabled) so a freshly
    onboarded user gets the same opt-in experience the system has had
    historically.
    """
    prefs = await get_user_preferences(current_user.id)
    return {
        "user_id": current_user.id,
        "stages": sorted(GOVERNED_STAGES),
        "prefs": prefs,
    }


@router.patch("/pipeline/my-notification-config")
async def update_my_notification_config(
    body: NotificationPrefsUpdate = Body(...),
    current_user: User = Depends(get_current_user),
):
    """Upsert the calling freelancer's per-job notification preferences.

    Validation:
      - Unknown ``job_id`` values are rejected so a typo can't strand a
        preference row that nothing reads.
      - Each value must be a bool — explicit toggle, no truthiness games.
    """
    if not body.prefs:
        raise HTTPException(status_code=422, detail="prefs map cannot be empty")

    for job_id, enabled in body.prefs.items():
        if job_id not in GOVERNED_STAGES:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown job_id '{job_id}' for notification preferences",
            )
        if not isinstance(enabled, bool):
            raise HTTPException(
                status_code=422,
                detail=f"prefs['{job_id}'] must be a boolean (got {type(enabled).__name__})",
            )

    for job_id, enabled in body.prefs.items():
        await set_user_preference(current_user.id, job_id, enabled)

    prefs = await get_user_preferences(current_user.id)
    return {
        "user_id": current_user.id,
        "stages": sorted(GOVERNED_STAGES),
        "prefs": prefs,
    }


# ── Freelancer Production Status ─────────────────────────────────────────────

from app.models.freelancer_pipeline_config import FreelancerPipelineConfig


class FreelancerStatusRequest(BaseModel):
    production_status: str  # 'RUN' or 'HOLD'


@router.get("/pipeline/freelancer-status")
async def get_freelancer_status(current_user: User = Depends(get_current_user)):
    """
    Returns the current freelancer's pipeline production status.
    Superusers can see global + all freelancer statuses.
    """
    from app.config import get_production_status as get_global_status

    user_status = await job_manager.get_freelancer_production_status(current_user.id)

    result = {
        "user_id": current_user.id,
        "production_status": user_status,
        "global_production_status": get_global_status(),
    }

    # Superusers also get a list of all freelancer configs
    if current_user.is_superuser:
        async with get_session_maker()() as db:
            from app.models.user import User as UserModel
            all_res = await db.execute(
                select(
                    UserModel.id,
                    UserModel.email,
                    FreelancerPipelineConfig.production_status,
                )
                .outerjoin(FreelancerPipelineConfig, UserModel.id == FreelancerPipelineConfig.user_id)
                .where(UserModel.role == "freelancer", UserModel.is_active == True)
            )
            result["freelancers"] = [
                {"user_id": row[0], "email": row[1], "production_status": row[2] or "RUN"}
                for row in all_res.all()
            ]

    return result


@router.patch("/pipeline/freelancer-status")
async def update_freelancer_status(
    request: FreelancerStatusRequest = Body(...),
    current_user: User = Depends(get_current_user),
):
    """
    Updates the current freelancer's pipeline production status (RUN/HOLD).
    Superusers can also update any freelancer's status via ?user_id= query param.
    """
    status_val = request.production_status.upper()
    if status_val not in ("RUN", "HOLD"):
        raise HTTPException(status_code=422, detail="production_status must be 'RUN' or 'HOLD'")

    target_user_id = current_user.id

    async with get_session_maker()() as db:
        result = await db.execute(
            select(FreelancerPipelineConfig)
            .where(FreelancerPipelineConfig.user_id == target_user_id)
        )
        config = result.scalars().first()
        if not config:
            config = FreelancerPipelineConfig(user_id=target_user_id, production_status=status_val)
            db.add(config)
        else:
            config.production_status = status_val
        await db.commit()

    logger.info(f"Freelancer {target_user_id} production_status set to {status_val}")
    return {"user_id": target_user_id, "production_status": status_val}


@router.patch("/pipeline/freelancer-status/{target_user_id}", dependencies=[Depends(get_current_active_superuser)])
async def update_freelancer_status_admin(
    target_user_id: int,
    request: FreelancerStatusRequest = Body(...),
):
    """
    Admin endpoint to update any freelancer's pipeline production status.
    Requires superuser privileges.
    """
    status_val = request.production_status.upper()
    if status_val not in ("RUN", "HOLD"):
        raise HTTPException(status_code=422, detail="production_status must be 'RUN' or 'HOLD'")

    async with get_session_maker()() as db:
        result = await db.execute(
            select(FreelancerPipelineConfig)
            .where(FreelancerPipelineConfig.user_id == target_user_id)
        )
        config = result.scalars().first()
        if not config:
            config = FreelancerPipelineConfig(user_id=target_user_id, production_status=status_val)
            db.add(config)
        else:
            config.production_status = status_val
        await db.commit()

    logger.info(f"Admin set freelancer {target_user_id} production_status to {status_val}")
    return {"user_id": target_user_id, "production_status": status_val}
