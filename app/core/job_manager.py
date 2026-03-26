import os
import json
import asyncio
from datetime import datetime
from loguru import logger
from functools import lru_cache

from app.config import get_settings, get_production_status

settings = get_settings()

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config")
CONFIG_FILE = os.path.join(CONFIG_DIR, "jobs_config.json")

# Default configuration matching existing `.env` values
DEFAULT_JOBS_CONFIG = {
    "discovery": {
        "status": "RUN",
        "type": "cron",
        "hour": settings.DISCOVERY_HOUR,
        "minute": 0
    },
    "qualification": {
        "status": "RUN",
        "type": "cron",
        "hour": settings.QUALIFICATION_HOUR,
        "minute": 0
    },
    "personalization": {
        "status": "RUN",
        "type": "cron",
        "hour": settings.PERSONALIZATION_HOUR,
        "minute": 0
    },
    "outreach": {
        "status": "RUN",
        "type": "cron",
        "hour": settings.OUTREACH_HOUR,
        "minute": 0
    },
    "reply_poll": {
        "status": "RUN",
        "type": "interval",
        "minutes": 30
    },
    "daily_report": {
        "status": "RUN",
        "type": "cron",
        "hour": settings.REPORT_HOUR,
        "minute": settings.REPORT_MINUTE
    },
    "followup_dispatch": {
        "status": "RUN",
        "type": "cron",
        "hour": 10,
        "minute": 0
    },
    "weekly_optimization": {
        "status": "RUN",
        "type": "cron",
        "day_of_week": "sun",
        "hour": 11,
        "minute": 0
    },
    "threads_discovery": {
        "status": "HOLD",
        "type": "cron",
        "hour": 10,
        "minute": 0
    },
    "threads_qualification": {
        "status": "HOLD",
        "type": "cron",
        "hour": 11,
        "minute": 0
    },
    "threads_engagement": {
        "status": "HOLD",
        "type": "cron",
        "hour": 12,
        "minute": 0
    },
    "threads_response_check": {
        "status": "HOLD",
        "type": "interval",
        "minutes": 30
    }
}

class JobManager:
    """
    Manages dynamic scheduling configurations for the autonomous daily pipeline tasks.

    This manager acts as an intermediary layer between the APScheduler and the JSON 
    configuration file (`jobs_config.json`). It handles parsing, deep validation, 
    fallback recovery mechanisms, and secure write operations to ensure the 
    scheduler remains robust against user errors or file corruption.
    """
    _last_modified_time = 0
    _config_cache = {}

    @classmethod
    def load_config(cls, force_reload=False) -> dict:
        """
        Loads and retrieves the job configuration properties from the persistent JSON store.
        
        If the configuration file is missing or corrupted, it automatically rebuilds it 
        using `DEFAULT_JOBS_CONFIG`. To enhance I/O performance, subsequent reads utilize 
        a memory cache unless a file modification is detected.

        Args:
            force_reload (bool): Bypasses the cache and forcefully re-fetches the JSON data.

        Returns:
            dict: The validated, structural dictionary containing scheduling configurations.
        """
        os.makedirs(CONFIG_DIR, exist_ok=True)
        
        if not os.path.exists(CONFIG_FILE):
             cls.save_config(DEFAULT_JOBS_CONFIG)
             cls._config_cache = DEFAULT_JOBS_CONFIG
             cls._last_modified_time = os.path.getmtime(CONFIG_FILE)
             return cls._config_cache

        try:
            mtime = os.path.getmtime(CONFIG_FILE)
            if not force_reload and mtime == cls._last_modified_time and cls._config_cache:
                return cls._config_cache
            
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                config = json.loads(content) if content else {}
                
            merged_config = json.loads(json.dumps(DEFAULT_JOBS_CONFIG))
            
            needs_save = False
            for key, val in config.items():
                if key in merged_config and isinstance(val, dict):
                    # Validate individual fields securely before merging
                    for field, field_val in val.items():
                        if field == "status" and str(field_val).upper() not in ["RUN", "HOLD"]:
                            needs_save = True
                            continue
                            
                        if field == "hour" and (not isinstance(field_val, int) or not (0 <= field_val <= 23)):
                            needs_save = True
                            continue
                            
                        if field in ["minute", "minutes"] and (not isinstance(field_val, int) or not (0 <= field_val <= 59)):
                            needs_save = True
                            continue
                            
                        if field == "day_of_week" and str(field_val).lower() not in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]:
                            needs_save = True
                            continue
                            
                        merged_config[key][field] = field_val
                else:
                    needs_save = True
                    
            if needs_save or config != merged_config:
                cls.save_config(merged_config)
            else:
                cls._config_cache = merged_config
                cls._last_modified_time = mtime
                
            return merged_config
            
        except Exception as e:
            logger.error(f"Failed to load {CONFIG_FILE}, falling back to defaults: {e}")
            return DEFAULT_JOBS_CONFIG

    @classmethod
    def save_config(cls, config: dict):
        """
        Safely serializes and persists the provided configuration dictionary to the JSON store
        using an atomic write operation (temp file + rename).
        """
        os.makedirs(CONFIG_DIR, exist_ok=True)
        temp_file = f"{CONFIG_FILE}.tmp"
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(config, f, indent=4)
                f.flush()
                os.fsync(f.fileno())
            
            os.replace(temp_file, CONFIG_FILE)
            
            cls._config_cache = config
            cls._last_modified_time = os.path.getmtime(CONFIG_FILE)
            logger.info("Successfully updated jobs_config.json (atomic write)")
        except Exception as e:
            if os.path.exists(temp_file):
                os.remove(temp_file)
            logger.error(f"Failed to write configuration to {CONFIG_FILE}: {e}")

    @classmethod
    def is_job_active(cls, job_id: str, ignore_global_hold: bool = False) -> bool:
        """
        Analyzes the active state of a specific job ID by referencing the current JSON configuration.
        
        Also acts as a gateway check against the global `.env` configuration `PRODUCTION_STATUS`. 
        If the global status is `HOLD`, all jobs automatically resolve to an inactive state, 
        UNLESS ignore_global_hold is set to True (e.g. for manual API triggers).

        Args:
            job_id (str): The unique identifier corresponding to the scheduled job.
            ignore_global_hold (bool): If True, bypasses the master PRODUCTION_STATUS check.

        Returns:
            bool: True if the job is permitted to run, False otherwise.
        """
        if not ignore_global_hold and get_production_status() == "HOLD":
            return False
            
        config = cls.load_config()
        job_config = config.get(job_id, {})
        return job_config.get("status", "RUN").upper() == "RUN"

job_manager = JobManager()
