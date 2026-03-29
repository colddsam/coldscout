"""
Dynamic Task Scheduling Core.

This module initializes the APScheduler background worker and synchronizes 
its state with the dynamic JSON-based configuration (`jobs_config.json`).

Design Choice:
We use a 60-second 'Sync Heartbeat' (`sync_scheduler_config`). This allows 
administrators to change a task's hour or status in the dashboard and have 
it take effect at runtime without a process reboot.
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger

from app.config import get_settings, get_production_status
from app.core.job_manager import job_manager

settings = get_settings()

scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")

def _apply_job_config(job_id: str, func, cfg: dict, misfire_grace_time_default: int = 600):
    """
    Low-level helper to translate JSON configuration schemas into 
    concrete APScheduler Trigger objects (Cron or Interval).
    """
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

    scheduler.add_job(
        func,
        trigger,
        id=job_id,
        replace_existing=True,
        misfire_grace_time=misfire_grace_time_default
    )

    if not job_manager.is_job_active(job_id):
        scheduler.pause_job(job_id)


def sync_scheduler_config():
    """
    Administrative Heartbeat.
    
    Reads the current JSON configuration on disk and reconciles it with 
    the live scheduler. This handles:
    1. Pausing/Resuming jobs based on the 'status' field.
    2. Modifying triggers (e.g., changing run time from 6 AM to 7 AM).
    """
    config = job_manager.load_config()
    
    for job_id, cfg in config.items():
        job = scheduler.get_job(job_id)
        if not job:
            continue
            
        is_active = job_manager.is_job_active(job_id)
        
        if is_active and job.next_run_time is None:
            scheduler.resume_job(job_id)
            logger.info(f"▶️ Resumed Job: {job_id}")
        elif not is_active and job.next_run_time is not None:
            scheduler.pause_job(job_id)
            logger.info(f"⏸️ Paused Job: {job_id}")

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
    from app.tasks.threads_pipeline import (
        run_threads_discovery_stage,
        run_threads_qualification_stage,
        run_threads_engagement_stage,
        run_threads_response_check,
    )
    from app.tasks.billing_tasks import check_subscription_expiry

    config = job_manager.load_config()

    job_map = {
        "discovery": run_discovery_stage,
        "qualification": run_qualification_stage,
        "personalization": run_personalization_stage,
        "outreach": run_outreach_stage,
        "reply_poll": poll_replies,
        "daily_report": generate_daily_report,
        "followup_dispatch": run_followup_dispatch,
        "weekly_optimization": run_weekly_optimization,
        "threads_discovery": run_threads_discovery_stage,
        "threads_qualification": run_threads_qualification_stage,
        "threads_engagement": run_threads_engagement_stage,
        "threads_response_check": run_threads_response_check,
    }

    for j_id, func in job_map.items():
        cfg = config.get(j_id)
        if cfg:
            _apply_job_config(j_id, func, cfg, misfire_grace_time_default=3600 if j_id == "weekly_optimization" else 600)

    scheduler.add_job(
        sync_scheduler_config,
        IntervalTrigger(seconds=60),
        id="scheduler_sync",
        replace_existing=True
    )

    # Subscription expiry check — always active, runs daily at 2 AM IST
    scheduler.add_job(
        check_subscription_expiry,
        CronTrigger(hour=2, minute=0, timezone="Asia/Kolkata"),
        id="subscription_expiry_check",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info("   🟢 subscription_expiry_check: cron 02:00 IST (always active)")

    scheduler.start()
    
    is_master_hold = get_production_status() == "HOLD"
    if is_master_hold:
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. All tasks are initialized in a PAUSED state.")
    else:
        logger.info("✅ APScheduler started with dynamic JSON configurations.")
        
    for j_id in job_map.keys():
        cfg = config.get(j_id, {})
        status = "🟢" if job_manager.is_job_active(j_id) else "🔴"
        logger.info(f"   {status} {j_id.ljust(20)}: {cfg.get('type')} configured")
