"""
AI Lead Generation System - Configuration Management

This module serves as the single source of truth for all application settings.
It utilizes Pydantic Settings for robust environment variable validation,
ensuring that the application fails fast if critical parameters are missing.

Key Features:
1. Type-Safe Settings: Validates data types for API keys, ports, and intervals.
2. Production Safety: Provides a dynamic mechanism to check system status (RUN/HOLD).
3. Environment Persistence: Includes a best-effort mechanism to persist changes back to .env.
"""
import os
from functools import lru_cache
from typing import Any, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Core settings class that maps environment variables to Python attributes.
    
    Attributes defined here define the operational boundaries of the system,
    from API keys for AI models (Groq) to scheduling intervals for the pipeline.
    """
    # Application Metadata
    APP_ENV: str = "development"
    APP_SECRET_KEY: str
    API_KEY: str
    SECURITY_SALT: str
    APP_URL: str = "http://localhost:8000"
    IMAGE_BASE_URL: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # Dynamic CORS Configuration
    # Accepts a comma-separated list of origins (e.g., "https://coldscout.colddsam.com")
    # This allows flexible cross-origin requests from the React frontend to this FastAPI backend.
    # DEFAULT IS EMPTY FOR SECURITY - MUST BE SET IN PRODUCTION VIA ENVIRONMENT VARIABLE
    BACKEND_CORS_ORIGINS: list[str] | str = []

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        """
        Parses the BACKEND_CORS_ORIGINS environment variable.
        Converts a comma-separated string of origins into a strict list of strings for the CORS middleware.
        """
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Operational Control: "RUN" allows the pipeline to execute, "HOLD" pauses all tasks
    PRODUCTION_STATUS: str = "RUN" 

    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str

    REDIS_URL: str = ""  # Optional — only required when reactivating Celery

    # AI and External Services
    GOOGLE_PLACES_API_KEY: str
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.1-8b-instant"

    # Communication Infrastructure (Brevo SMTP for Outreach)
    BREVO_SMTP_HOST: str = "smtp-relay.brevo.com"
    BREVO_SMTP_PORT: int = 587
    BREVO_SMTP_USER: str
    BREVO_SMTP_PASSWORD: str
    FROM_EMAIL: str
    FROM_NAME: str = "Lead Generation"
    REPLY_TO_EMAIL: str

    # Incoming Communication (Gmail IMAP for Inbox processing)
    IMAP_HOST: str = "imap.gmail.com"
    IMAP_USER: str
    IMAP_PASSWORD: str

    # Notification and Alerting
    ADMIN_EMAIL: str
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    WHATSAPP_NUMBER: str = ""
    CALLMEBOT_API_KEY: str = ""
    
    # Automated Pipeline Schedule (24-hour format)
    DISCOVERY_HOUR: int = 6
    QUALIFICATION_HOUR: int = 7
    PERSONALIZATION_HOUR: int = 8
    OUTREACH_HOUR: int = 9
    REPORT_HOUR: int = 23
    REPORT_MINUTE: int = 30
    
    # Safety Intervals (Preventing Spam Triggers)
    EMAIL_SEND_INTERVAL_SECONDS: int = 360
    
    # Branding and Redirects
    BOOKING_LINK: str = ""
    SENDER_ADDRESS: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

@lru_cache
def get_settings() -> Settings:
    """
    Instantiates and returns the application settings.
    Utilizes lru_cache to ensure specific settings validation and extraction
    is executed only once per process lifecycle.

    Returns:
        Settings: The validated application settings.
    """
    return Settings()

def get_production_status() -> str:
    """
    Determines if the system is currently authorized to execute pipeline tasks.
    
    This function reads directly from 'os.environ' rather than the cached settings
    singleton. This design choice is critical: it allows administrative API calls 
    (like /hold or /resume) to change system behavior in real-time without 
    requiring an application restart.

    Returns:
        str: "RUN" if the pipeline is active, "HOLD" if it is paused.
    """
    return os.environ.get("PRODUCTION_STATUS", get_settings().PRODUCTION_STATUS).upper()


def set_env_variable(key: str, value: str):
    """
    Updates a given key-value pair in both os.environ (for immediate in-process effect)
    and the .env file (for best-effort persistence across restarts).
    """
    # Update in-process environment so all runtime reads see the change immediately
    os.environ[key] = value

    # Best-effort .env file persistence (useful for local dev, no-op effect on Render)
    env_file = ".env"
    try:
        if not os.path.exists(env_file):
            with open(env_file, "w") as f:
                f.write(f"{key}={value}\n")
            return

        with open(env_file, "r") as f:
            lines = f.readlines()

        key_found = False
        with open(env_file, "w") as f:
            for line in lines:
                if line.startswith(f"{key}="):
                    f.write(f"{key}={value}\n")
                    key_found = True
                else:
                    f.write(line)
            if not key_found:
                f.write(f"{key}={value}\n")
    except OSError:
        pass  # .env write is best-effort; os.environ update above is what matters