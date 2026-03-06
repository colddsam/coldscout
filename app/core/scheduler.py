# app/core/scheduler.py
# ✅ ACTIVE — APScheduler async approach with JSON Configuration

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger

from app.config import get_settings
from app.core.job_manager import job_manager

settings = get_settings()

scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")

def _apply_job_config(job_id: str, func, cfg: dict, misfire_grace_time_default: int = 600):
    """Adds a job to the scheduler based on JSON config, or updates status."""
    trigger = None
    if cfg.get("type") == "cron":
        kwargs = {}
        if "minute" in cfg: kwargs["minute"] = cfg["minute"]
        if "hour" in cfg: kwargs["hour"] = cfg["hour"]
        if "day_of_week" in cfg: kwargs["day_of_week"] = cfg["day_of_week"]
        trigger = CronTrigger(**kwargs)
    elif cfg.get("type") == "interval":
        trigger = IntervalTrigger(minutes=cfg.get("minutes", 30))
        
    if not trigger:
        logger.error(f"Invalid trigger configuration for {job_id}")
        return

    # Add the job
    scheduler.add_job(
        func,
        trigger,
        id=job_id,
        replace_existing=True,
        misfire_grace_time=misfire_grace_time_default
    )

    # Initial Pause State Check
    if not job_manager.is_job_active(job_id):
        scheduler.pause_job(job_id)


def sync_scheduler_config():
    """Runs periodically to check for JSON config updates and applies changes to APScheduler dynamically."""
    config = job_manager.load_config()
    
    for job_id, cfg in config.items():
        job = scheduler.get_job(job_id)
        if not job:
            continue
            
        # 1. Sync Status (Pause/Resume)
        is_active = job_manager.is_job_active(job_id)
        
        # job.next_run_time is None when paused
        if is_active and job.next_run_time is None:
            scheduler.resume_job(job_id)
            logger.info(f"▶️ Resumed Job: {job_id}")
        elif not is_active and job.next_run_time is not None:
            scheduler.pause_job(job_id)
            logger.info(f"⏸️ Paused Job: {job_id}")

        # 2. Sync Schedule Timings
        new_trigger = None
        if cfg.get("type") == "cron":
            kwargs = {}
            if "minute" in cfg: kwargs["minute"] = cfg["minute"]
            if "hour" in cfg: kwargs["hour"] = cfg["hour"]
            if "day_of_week" in cfg: kwargs["day_of_week"] = cfg["day_of_week"]
            new_trigger = CronTrigger(**kwargs)
        elif cfg.get("type") == "interval":
            new_trigger = IntervalTrigger(minutes=cfg.get("minutes", 30))

        if new_trigger and str(new_trigger) != str(job.trigger):
            scheduler.reschedule_job(job_id, trigger=new_trigger)
            logger.info(f"🔄 Rescheduled {job_id} -> {new_trigger}")


def setup_scheduler():
    """
    Registers all pipeline stages as dynamic cron jobs mapped to the JSON configuration.
    """
    
    # Import here to avoid circular imports
    from app.tasks.daily_pipeline import (
        run_discovery_stage,
        run_qualification_stage,
        run_personalization_stage,
        run_outreach_stage,
        poll_replies,
        generate_daily_report,
    )
    from app.modules.outreach.followup_engine import run_followup_dispatch
    from app.modules.analytics.performance_analyzer import run_weekly_optimization

    config = job_manager.load_config()

    # Map jobs to their functions
    job_map = {
        "discovery": run_discovery_stage,
        "qualification": run_qualification_stage,
        "personalization": run_personalization_stage,
        "outreach": run_outreach_stage,
        "reply_poll": poll_replies,
        "daily_report": generate_daily_report,
        "followup_dispatch": run_followup_dispatch,
        "weekly_optimization": run_weekly_optimization,
    }

    # Register each job dynamically
    for j_id, func in job_map.items():
        cfg = config.get(j_id)
        if cfg:
            _apply_job_config(j_id, func, cfg, misfire_grace_time_default=3600 if j_id == "weekly_optimization" else 600)

    # Register the Sync task that checks the JSON file every 60 seconds
    scheduler.add_job(
        sync_scheduler_config,
        IntervalTrigger(seconds=60),
        id="scheduler_sync",
        replace_existing=True
    )

    scheduler.start()
    
    is_master_hold = settings.PRODUCTION_STATUS.upper() == "HOLD"
    if is_master_hold:
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. All tasks are initialized in a PAUSED state.")
    else:
        logger.info("✅ APScheduler started with dynamic JSON configurations.")
        
    for j_id in job_map.keys():
        cfg = config.get(j_id, {})
        status = "🟢" if job_manager.is_job_active(j_id) else "🔴"
        logger.info(f"   {status} {j_id.ljust(20)}: {cfg.get('type')} configured")
