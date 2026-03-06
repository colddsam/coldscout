from fastapi import APIRouter, Depends, HTTPException, Body
from app.main import get_api_key
import asyncio
from datetime import datetime
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

router = APIRouter(dependencies=[Depends(get_api_key)])

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
        "report": [generate_daily_report],
        "optimization": [run_weekly_optimization]
    }
    
    if request.stage not in valid_stages:
        raise HTTPException(status_code=400, detail="Invalid stage specified")
        
    for stage_func in valid_stages[request.stage]:
        asyncio.create_task(stage_func())
        
    return {
        "status": "triggered",
        "stage": request.stage,
        "triggered_at": datetime.utcnow().isoformat()
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
            "stage": "discovery", # we don't track exact current stage per day easily unless we add states tracking, but overall pipeline status is tracked
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
    Writes PRODUCTION_STATUS=HOLD to .env file to pause pipeline execution safely.
    """
    try:
        from app.config import set_env_variable
        set_env_variable("PRODUCTION_STATUS", "HOLD")
        return {"status": "held"}
    except Exception as e:
        logger.error(f"Failed to hold pipeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse .env file")

@router.post("/pipeline/resume")
async def resume_pipeline():
    """
    Writes PRODUCTION_STATUS=RUN to .env file to resume pipeline execution.
    """
    try:
        from app.config import set_env_variable
        set_env_variable("PRODUCTION_STATUS", "RUN")
        return {"status": "running"}
    except Exception as e:
        logger.error(f"Failed to resume pipeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse .env file")


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
    
    # Merge updates safely with strict validation
    for job_id, updates in config_updates.items():
        if job_id not in current_config or not isinstance(updates, dict):
            continue
            
        for field, val in updates.items():
            # Validate Status
            if field == "status" and str(val).upper() not in ["RUN", "HOLD"]:
                raise HTTPException(status_code=422, detail=f"Invalid status '{val}' for {job_id}. Must be RUN or HOLD.")
            # Validate Hour
            if field == "hour" and (not isinstance(val, int) or not (0 <= val <= 23)):
                raise HTTPException(status_code=422, detail=f"Invalid hour '{val}' for {job_id}. Must be 0-23.")
            # Validate Minute / Minutes
            if field in ["minute", "minutes"] and (not isinstance(val, int) or not (0 <= val <= 59)):
                raise HTTPException(status_code=422, detail=f"Invalid minute '{val}' for {job_id}. Must be 0-59.")
            # Validate Day of Week
            if field == "day_of_week" and str(val).lower() not in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]:
                raise HTTPException(status_code=422, detail=f"Invalid day_of_week '{val}' for {job_id}.")
                
            current_config[job_id][field] = val
            
    job_manager.save_config(current_config)
    
    return {
        "status": "success",
        "message": "Configuration updated successfully. APScheduler will automatically sync within 60 seconds.",
        "config": current_config
    }
