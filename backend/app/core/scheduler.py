"""
Dynamic Task Scheduling Core.

APScheduler wrapper that reflects the authoritative job configuration now
stored in the ``global_job_configs`` Postgres table (managed by
:class:`app.core.job_manager.JobManager`). The 60-second heartbeat
(``sync_scheduler_config``) reconciles the DB snapshot into live
APScheduler triggers so operators can retime or pause jobs from the
dashboard without a process restart.
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger

from app.config import get_settings, get_production_status
from app.core.job_manager import job_manager

settings = get_settings()

scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


def _build_trigger(cfg: dict):
    if cfg.get("type") == "cron":
        kwargs = {}
        if cfg.get("minute") is not None:
            kwargs["minute"] = cfg["minute"]
        if cfg.get("hour") is not None:
            kwargs["hour"] = cfg["hour"]
        if cfg.get("day_of_week"):
            kwargs["day_of_week"] = cfg["day_of_week"]
        return CronTrigger(**kwargs)
    if cfg.get("type") == "interval":
        return IntervalTrigger(minutes=cfg.get("minutes", 30))
    return None


def _apply_job_config(job_id: str, func, cfg: dict, misfire_grace_time_default: int = 600):
    trigger = _build_trigger(cfg)
    if not trigger:
        logger.error(f"Invalid trigger configuration for {job_id}")
        return

    scheduler.add_job(
        func,
        trigger,
        id=job_id,
        replace_existing=True,
        misfire_grace_time=misfire_grace_time_default,
    )

    if not job_manager.is_job_active(job_id):
        scheduler.pause_job(job_id)


async def sync_scheduler_config():
    """Heartbeat: refresh DB cache, then reconcile live APScheduler state."""
    config = await job_manager.refresh_global_cache()

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

        new_trigger = _build_trigger(cfg)
        if new_trigger and str(new_trigger) != str(job.trigger):
            scheduler.reschedule_job(job_id, trigger=new_trigger)
            logger.info(f"🔄 Rescheduled {job_id} -> {new_trigger}")


async def setup_scheduler():
    """Bootstrap the scheduler. Must run inside the asyncio event loop so the
    DB-backed job config cache can be primed before jobs are registered.
    """
    from app.tasks.daily_pipeline import (
        dispatch_stage_for_all_freelancers,
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

    # Prime the DB cache before touching APScheduler.
    config = await job_manager.refresh_global_cache()

    async def _dispatch_discovery():
        await dispatch_stage_for_all_freelancers(run_discovery_stage, "discovery")

    async def _dispatch_qualification():
        await dispatch_stage_for_all_freelancers(run_qualification_stage, "qualification")

    async def _dispatch_personalization():
        await dispatch_stage_for_all_freelancers(run_personalization_stage, "personalization")

    async def _dispatch_outreach():
        await dispatch_stage_for_all_freelancers(run_outreach_stage, "outreach")

    async def _dispatch_reply_poll():
        await dispatch_stage_for_all_freelancers(poll_replies, "reply_poll")

    async def _dispatch_daily_report():
        await dispatch_stage_for_all_freelancers(generate_daily_report, "daily_report")

    async def _dispatch_followup():
        await dispatch_stage_for_all_freelancers(run_followup_dispatch, "followup_dispatch")

    async def _dispatch_threads_discovery():
        await dispatch_stage_for_all_freelancers(run_threads_discovery_stage, "threads_discovery")

    async def _dispatch_threads_qualification():
        await dispatch_stage_for_all_freelancers(run_threads_qualification_stage, "threads_qualification")

    async def _dispatch_threads_engagement():
        await dispatch_stage_for_all_freelancers(run_threads_engagement_stage, "threads_engagement")

    async def _dispatch_threads_response_check():
        await dispatch_stage_for_all_freelancers(run_threads_response_check, "threads_response_check")

    job_map = {
        "discovery": _dispatch_discovery,
        "qualification": _dispatch_qualification,
        "personalization": _dispatch_personalization,
        "outreach": _dispatch_outreach,
        "reply_poll": _dispatch_reply_poll,
        "daily_report": _dispatch_daily_report,
        "followup_dispatch": _dispatch_followup,
        "weekly_optimization": run_weekly_optimization,
        "threads_discovery": _dispatch_threads_discovery,
        "threads_qualification": _dispatch_threads_qualification,
        "threads_engagement": _dispatch_threads_engagement,
        "threads_response_check": _dispatch_threads_response_check,
    }

    for j_id, func in job_map.items():
        cfg = config.get(j_id)
        if cfg:
            _apply_job_config(
                j_id, func, cfg,
                misfire_grace_time_default=3600 if j_id == "weekly_optimization" else 600,
            )

    scheduler.add_job(
        sync_scheduler_config,
        IntervalTrigger(seconds=60),
        id="scheduler_sync",
        replace_existing=True,
    )

    scheduler.add_job(
        check_subscription_expiry,
        CronTrigger(hour=2, minute=0, timezone="Asia/Kolkata"),
        id="subscription_expiry_check",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info("   🟢 subscription_expiry_check: cron 02:00 IST (always active)")

    scheduler.start()

    if get_production_status() == "HOLD":
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. All tasks are initialized in a PAUSED state.")
    else:
        logger.info("✅ APScheduler started with DB-backed job configuration.")

    for j_id in job_map.keys():
        cfg = config.get(j_id, {})
        status = "🟢" if job_manager.is_job_active(j_id) else "🔴"
        logger.info(f"   {status} {j_id.ljust(20)}: {cfg.get('type')} configured")
