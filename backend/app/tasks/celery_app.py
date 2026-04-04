"""
Celery integration and configuration module.
Initializes the distributed task queue and schedules automated background jobs.
"""
import os
from celery import Celery
from celery.schedules import crontab
from app.config import get_settings
settings = get_settings()

redis_url = settings.REDIS_URL
if redis_url.startswith("rediss://") and "?" not in redis_url:
    redis_url += "?ssl_cert_reqs=CERT_NONE"

celery_app = Celery(
    "lead_gen_worker",
    broker=redis_url,
    include=["app.tasks.daily_pipeline"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=False,
    task_time_limit=3600,
    task_ignore_result=True,   
    broker_transport_options={
        'visibility_timeout': 3600,
        'max_connections': 2,
    },
    redis_max_connections=2,
    broker_pool_limit=1,
    worker_prefetch_multiplier=1,
    beat_max_loop_interval=300, 
    worker_send_task_events=False,
    worker_enable_remote_control=False,
    worker_disable_rate_limits=True,
    worker_cancel_long_running_tasks_on_connection_loss=True
)

celery_app.conf.beat_schedule = {
    "run-discovery-morning": {
        "task": "app.tasks.daily_pipeline.run_discovery_task",
        "schedule": crontab(hour=settings.DISCOVERY_HOUR, minute=0),
    },
    "run-qualification-morning": {
        "task": "app.tasks.daily_pipeline.run_qualification_task",
        "schedule": crontab(hour=settings.QUALIFICATION_HOUR, minute=0),
    },
    "run-personalize-morning": {
        "task": "app.tasks.daily_pipeline.run_personalization_task",
        "schedule": crontab(hour=settings.PERSONALIZATION_HOUR, minute=0),
    },
    "run-outreach-morning": {
        "task": "app.tasks.daily_pipeline.run_outreach_send_task",
        "schedule": crontab(hour=settings.OUTREACH_HOUR, minute=0),
    },
    "run-reply-tracking-poll": {
        "task": "app.tasks.daily_pipeline.run_reply_polling_task",
        "schedule": crontab(minute="*/30"),
    },
    "run-daily-report-night": {
        "task": "app.tasks.daily_pipeline.run_daily_report_task",
        "schedule": crontab(hour=settings.REPORT_HOUR, minute=settings.REPORT_MINUTE),
    },
}
