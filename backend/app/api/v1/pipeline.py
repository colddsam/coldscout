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
from fastapi import APIRouter, Depends, HTTPException, Body
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

from app.api.deps import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

from app.tasks.threads_pipeline import (
    run_threads_discovery_stage,
    run_threads_qualification_stage,
    run_threads_engagement_stage,
    run_threads_response_check
)

class TriggerRequest(BaseModel):
    stage: str
    dry_run: bool = False

@router.post("/pipeline/trigger")
async def trigger_pipeline(request: TriggerRequest = Body(...)):
    """
    Asynchronously triggers a selected pipeline stage for immediate manual execution.
    
    This endpoint permits administrators to bypass the APScheduler and manually invoke
    critical business workflows independently (e.g., discovery, outreach).
    
    Args:
        request (TriggerRequest): Contains the specific 'stage' to be triggered.
            Allowed arguments: 'all', 'discovery', 'qualification', 'personalization', 
                               'outreach', 'report', 'optimization'.
    """
    valid_stages = {
        "all": [
            run_discovery_stage, 
            run_qualification_stage, 
            run_personalization_stage, 
            run_outreach_stage, 
            generate_daily_report
        ],
        "discovery": [run_discovery_stage],
        "qualification": [run_qualification_stage],
        "personalization": [run_personalization_stage],
        "outreach": [run_outreach_stage],
        "daily_report": [generate_daily_report],
        "weekly_optimization": [run_weekly_optimization],
        "threads_discovery": [run_threads_discovery_stage],
        "threads_qualification": [run_threads_qualification_stage],
        "threads_engagement": [run_threads_engagement_stage],
        "threads_response_check": [run_threads_response_check]
    }
    
    if request.stage not in valid_stages:
        raise HTTPException(status_code=400, detail="Invalid stage specified")
        
    for stage_func in valid_stages[request.stage]:
        asyncio.create_task(stage_func(manual=True))
        
    return {
        "status": "triggered",
        "stage": request.stage,
        "triggered_at": datetime.now(timezone.utc).isoformat()
    }

@router.get("/pipeline/status")
async def pipeline_status():
    """
    Retrieves the holistic system status, aggregating data from the latest pipeline run
    and verifying the active status of the APScheduler and its registered job pool.

    Returns:
        dict: A comprehensive payload detailing the last execution timeframe, the 
              scheduler's operational status, and a list of all currently active jobs.
    """
    async with get_session_maker()() as db:
        stmt = select(DailyReport).order_by(DailyReport.report_date.desc()).limit(1)
        res = await db.execute(stmt)
        latest_report = res.scalars().first()
        
    last_run = None
    if latest_report:
        last_run = {
            "stage": "discovery",
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
            
    return {
        "last_run": last_run,
        "scheduler_running": scheduler.running,
        "jobs": jobs
    }

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
