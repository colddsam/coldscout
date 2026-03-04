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
    generate_daily_report,
    is_pipeline_active
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
    Triggers a specific pipeline stage immediately.
    Accepts: 'all' | 'discovery' | 'qualification' | 'personalization' | 'outreach' | 'report' | 'optimization'
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
    Returns the current status of the pipeline, recent reports, and scheduled jobs.
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
