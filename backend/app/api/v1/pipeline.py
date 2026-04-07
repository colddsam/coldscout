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
import asyncio
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
    enqueue_job, mark_running, mark_completed, mark_failed,
    append_log, get_active_jobs, get_job_history, is_stage_busy,
)

from app.api.deps import get_current_active_superuser

router = APIRouter(dependencies=[Depends(get_current_active_superuser)])

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

# ── Global serial job queue ───────────────────────────────────────────────────
# All manually triggered jobs are pushed here and consumed one at a time by a
# single background worker. This guarantees that if job A is running and job B
# is triggered, B stays in "queued" state until A finishes.

_job_queue: asyncio.Queue | None = None
_worker_running = False


def _get_queue() -> asyncio.Queue:
    global _job_queue
    if _job_queue is None:
        _job_queue = asyncio.Queue()
    return _job_queue


async def _ensure_worker():
    """Start the queue consumer if it isn't already running."""
    global _worker_running
    if _worker_running:
        return
    _worker_running = True
    asyncio.create_task(_queue_worker())


async def _queue_worker():
    """Pulls jobs from the queue one at a time and runs them sequentially."""
    global _worker_running
    q = _get_queue()
    try:
        while True:
            stage_name, stage_func, manual = await asyncio.wait_for(q.get(), timeout=60.0)
            try:
                await mark_running(stage_name)
                await stage_func(manual=manual)
                await mark_completed(stage_name, f"{stage_name} completed successfully")
            except Exception as e:
                await mark_failed(stage_name, f"{type(e).__name__}: {str(e)[:200]}")
                logger.exception(f"Tracked stage {stage_name} failed")
            finally:
                q.task_done()
    except asyncio.TimeoutError:
        # No jobs for 60s — shut down the worker, it will restart on next trigger
        pass
    finally:
        _worker_running = False


@router.post("/pipeline/trigger")
async def trigger_pipeline(request: TriggerRequest = Body(...)):
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

    q = _get_queue()
    triggered = []
    for stage_name in stages_to_run:
        await enqueue_job(stage_name, triggered_by="manual")
        stage_func = STAGE_FUNCTIONS[stage_name]
        await q.put((stage_name, stage_func, True))
        triggered.append(stage_name)

    await _ensure_worker()

    # Return a snapshot of active stages so the UI can update instantly
    active_stages = await get_active_jobs()

    return {
        "status": "triggered",
        "stage": request.stage,
        "stages": triggered,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "active_stages": active_stages,
    }

@router.get("/pipeline/status")
async def pipeline_status():
    """
    Retrieves the holistic system status including per-stage active job tracking.

    Returns:
        dict: last_run info, scheduler status, scheduled jobs list, and
              active_stages map showing which stages are currently queued/running.
    """
    async with get_session_maker()() as db:
        stmt = select(DailyReport).order_by(DailyReport.report_date.desc()).limit(1)
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

    # Per-stage active job tracking
    active_stages = {}
    try:
        active_stages = await get_active_jobs()
    except Exception as e:
        logger.warning(f"Failed to fetch active jobs from Redis: {e}")

    return {
        "last_run": last_run,
        "scheduler_running": scheduler.running,
        "jobs": jobs,
        "active_stages": active_stages,
    }


@router.get("/pipeline/history")
async def pipeline_history(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    """
    Returns persistent job run history for the Pipeline Log UI.
    Results are ordered newest-first with pagination support.
    """
    try:
        history = await get_job_history(limit=limit, offset=offset)
        return {"history": history, "limit": limit, "offset": offset}
    except Exception as e:
        logger.error(f"Failed to fetch pipeline history: {e}")
        return {"history": [], "limit": limit, "offset": offset}

@router.post("/pipeline/hold")
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

@router.post("/pipeline/resume")
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
    """
    Retrieves the live, dynamic scheduling configuration from the underlying JobManager.

    This configuration dictates the precise timing and operational status (RUN/HOLD) 
    of all autonomous pipeline components. Force-reloads the state to guarantee accuracy.

    Returns:
        dict: The parsed schemas representing the current operational cron variables.
    """
    return job_manager.load_config(force_reload=True)

@router.patch("/pipeline/jobs_config")
async def update_jobs_config(config_updates: dict = Body(...)):
    """
    Mutates the persistent scheduling configuration via a strict merge-patch strategy.
    
    Validates provided arguments against bound parameters (e.g., minute: 0-59, status: RUN/HOLD).
    Changes are persisted to standard output and are swept asynchronously by the live scheduler 
    check every 60 seconds without requiring a server reboot.
    
    Args:
        config_updates (dict): A partial mapping of job identifiers to attribute changes.
            Example: {"discovery": {"status": "HOLD", "hour": 5}}

    Returns:
        dict: A confirmation detailing the successfully merged configuration payload.
    """
    current_config = job_manager.load_config()
    
    for job_id, updates in config_updates.items():
        if job_id not in current_config or not isinstance(updates, dict):
            continue
            
        for field, val in updates.items():
            if field == "status" and str(val).upper() not in ["RUN", "HOLD"]:
                raise HTTPException(status_code=422, detail=f"Invalid status '{val}' for {job_id}. Must be RUN or HOLD.")
            if field == "hour" and (not isinstance(val, int) or not (0 <= val <= 23)):
                raise HTTPException(status_code=422, detail=f"Invalid hour '{val}' for {job_id}. Must be 0-23.")
            if field in ["minute", "minutes"] and (not isinstance(val, int) or not (0 <= val <= 59)):
                raise HTTPException(status_code=422, detail=f"Invalid minute '{val}' for {job_id}. Must be 0-59.")
            if field == "day_of_week" and str(val).lower() not in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]:
                raise HTTPException(status_code=422, detail=f"Invalid day_of_week '{val}' for {job_id}.")
                
            current_config[job_id][field] = val
            
    job_manager.save_config(current_config)
    
    return {
        "status": "success",
        "message": "Configuration updated successfully. APScheduler will automatically sync within 60 seconds.",
        "config": current_config
    }
