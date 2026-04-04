"""
AI Lead Generation System - Configuration Management

This module serves as the single source of truth for all application settings.
It utilizes Pydantic Settings for robust environment variable validation,
ensuring that the application fails fast if critical parameters are missing.

Key Features:
1. Type-Safe Settings: Validates data types for API keys, ports, and intervals.
2. Schedule Validation: Enforces valid ranges for cron hours/minutes at startup so
   APScheduler never receives out-of-range values that would trigger a silent misfire.
3. Production Safety: Provides a dynamic mechanism to check system status (RUN/HOLD).
4. Environment Persistence: Includes a best-effort mechanism to persist changes back to .env.
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
    """
    The current application environment (e.g., development, production, staging).
    """

    APP_SECRET_KEY: str
    """
    A secret key used for cryptographic purposes, such as signing cookies.
    """

    API_KEY: str
    """
    An API key used to authenticate requests to external services.
    """

    SECURITY_SALT: str
    """
    A salt value used to secure password storage.
    """

    APP_URL: str = "http://localhost:8000"
    """
    The base URL of the application.
    """

    IMAGE_BASE_URL: str = ""
    """
    The base URL for image assets.
    """

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    """
    The expiration time for access tokens in minutes.
    """

    # Dynamic CORS Configuration
    # Accepts a comma-separated list of origins (e.g., "https://coldscout.colddsam.com")
    # This allows flexible cross-origin requests from the React frontend to this FastAPI backend.
    # DEFAULT IS EMPTY FOR SECURITY - MUST BE SET IN PRODUCTION VIA ENVIRONMENT VARIABLE
    BACKEND_CORS_ORIGINS: list[str] | str = []
    """
    A list of allowed origins for CORS requests.
    """

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        """
        Parses the BACKEND_CORS_ORIGINS environment variable.
        Converts a comma-separated string of origins into a strict list of strings for the CORS middleware.
        
        Args:
            v: The environment variable value.
        
        Returns:
            A list of allowed origins.
        
        Raises:
            ValueError: If the input value is invalid.
        """
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # Operational Control: "RUN" allows the pipeline to execute, "HOLD" pauses all tasks
    PRODUCTION_STATUS: str = "RUN"
    """
    The current production status (RUN or HOLD).
    """

    DATABASE_URL: str
    """
    The URL of the database.
    """

    SUPABASE_URL: str
    """
    The URL of the Supabase instance.
    """

    SUPABASE_ANON_KEY: str
    """
    The anonymous key for Supabase.
    """

    SUPABASE_SERVICE_ROLE_KEY: str = ""
    """
    The service role key for Supabase (bypasses RLS for server-side operations).
    Obtain from Supabase Dashboard → Settings → API → service_role key.
    Keep this secret — never expose to the frontend.
    """

    SUPABASE_JWT_SECRET: str = ""
    """
    The JWT secret for Supabase Auth token verification.
    Required for backend to verify Supabase-issued JWTs.
    Obtain from Supabase Dashboard → Settings → API → JWT Secret.
    """

    REDIS_URL: str = ""  # Optional — only required when reactivating Celery
    """
    The URL of the Redis instance.
    """

    # AI and External Services
    GOOGLE_PLACES_API_KEY: str
    """
    The API key for Google Places.
    """

    GROQ_API_KEY: str
    """
    The API key for Groq.
    """

    GROQ_MODEL: str = "llama-3.1-8b-instant"
    """
    The Groq model to use.
    """

    # ── Meta Threads Lead Generation ──────────────────────────────
    # Threads API OAuth credentials (obtainable from Meta Developer Portal)
    THREADS_APP_ID: str = ""
    """
    The Threads app ID.
    """

    THREADS_APP_SECRET: str = ""
    """
    The Threads app secret.
    """

    THREADS_REDIRECT_URI: str = ""
    """
    The Threads redirect URI.
    """

    # Operational limits — conservative defaults to prevent spam flagging
    THREADS_DAILY_REPLY_CAP: int = 20
    """
    The daily reply cap.
    """

    THREADS_REPLY_COOLDOWN_HOURS: int = 24
    """
    The reply cooldown hours.
    """

    THREADS_MIN_FOLLOWERS_FILTER: int = 50
    """
    The minimum followers filter.
    """

    THREADS_ENABLED: bool = False  # Master kill-switch, false until API review complete
    """
    Whether Threads is enabled.
    """

    # ── Razorpay Payment Gateway ───────────────────────────────────
    RAZORPAY_KEY_ID: str = ""
    """
    Razorpay API Key ID.
    Obtain from Razorpay Dashboard → Settings → API Keys.
    Use test keys (rzp_test_...) in development, live keys (rzp_live_...) in production.
    """

    RAZORPAY_KEY_SECRET: str = ""
    """
    Razorpay API Key Secret.
    Used to create orders and verify payment signatures (HMAC-SHA256).
    """

    RAZORPAY_WEBHOOK_SECRET: str = ""
    """
    Razorpay Webhook Secret.
    Set in Razorpay Dashboard → Webhooks → Secret.
    Used to verify the authenticity of inbound Razorpay webhook events.
    """

    # Communication Infrastructure (Brevo SMTP for Outreach)
    BREVO_WEBHOOK_SECRET: str = ""
    """
    Optional shared secret for validating inbound Brevo webhook requests.
    When set, the backend verifies the 'X-Brevo-Secret' header on every webhook
    call to prevent spoofed event injection. Obtain or define this value in the
    Brevo dashboard webhook configuration and mirror it here.
    Leave empty to skip validation (not recommended for production).
    """

    BREVO_SMTP_HOST: str = "smtp-relay.brevo.com"
    """
    The Brevo SMTP host.
    """

    BREVO_SMTP_PORT: int = 587
    """
    The Brevo SMTP port.
    """

    BREVO_SMTP_USER: str
    """
    The Brevo SMTP user.
    """

    BREVO_SMTP_PASSWORD: str
    """
    The Brevo SMTP password.
    """

    FROM_EMAIL: str
    """
    The from email address.
    """

    FROM_NAME: str = "Lead Generation"
    """
    The from name.
    """

    REPLY_TO_EMAIL: str
    """
    The reply to email address.
    """

    # Incoming Communication (Gmail IMAP for Inbox processing)
    IMAP_HOST: str = "imap.gmail.com"
    """
    The IMAP host.
    """

    IMAP_USER: str
    """
    The IMAP user.
    """

    IMAP_PASSWORD: str
    """
    The IMAP password.
    """

    # Notification and Alerting
    ADMIN_EMAIL: str
    """
    The admin email address.
    """

    TELEGRAM_BOT_TOKEN: str = ""
    """
    The Telegram bot token.
    """

    TELEGRAM_CHAT_ID: str = ""
    """
    The Telegram chat ID.
    """

    WHATSAPP_NUMBER: str = ""
    """
    The WhatsApp number.
    """

    CALLMEBOT_API_KEY: str = ""
    """
    The CallMeBot API key.
    """

    # Automated Pipeline Schedule (24-hour format)
    DISCOVERY_HOUR: int = 6
    """
    The discovery hour.
    """

    QUALIFICATION_HOUR: int = 7
    """
    The qualification hour.
    """

    PERSONALIZATION_HOUR: int = 8
    """
    The personalization hour.
    """

    OUTREACH_HOUR: int = 9
    """
    The outreach hour.
    """

    REPORT_HOUR: int = 23
    """
    The report hour.
    """

    REPORT_MINUTE: int = 30
    """
    The minute within REPORT_HOUR at which the daily report job fires (0-59).
    """

    # Safety Intervals (Preventing Spam Triggers)
    EMAIL_SEND_INTERVAL_SECONDS: int = 360
    """
    Minimum seconds between consecutive outbound emails during the outreach stage.
    Must be at least 60 seconds to avoid triggering Brevo rate limits and spam filters.
    """

    # ── Field Validators ──────────────────────────────────────────────────────
    # These run at startup and raise a ValueError (shown as a clear error message)
    # if any pipeline scheduling value is outside its valid range, preventing silent
    # APScheduler misfires caused by bad configuration.

    @field_validator(
        "DISCOVERY_HOUR", "QUALIFICATION_HOUR", "PERSONALIZATION_HOUR",
        "OUTREACH_HOUR", "REPORT_HOUR",
        mode="before",
    )
    @classmethod
    def validate_hour(cls, v: Any) -> int:
        """Ensures schedule hour values are within the valid 24-hour clock range (0-23)."""
        v = int(v)
        if not (0 <= v <= 23):
            raise ValueError(f"Schedule hour must be between 0 and 23, got {v}.")
        return v

    @field_validator("REPORT_MINUTE", mode="before")
    @classmethod
    def validate_minute(cls, v: Any) -> int:
        """Ensures REPORT_MINUTE is within the valid range (0-59)."""
        v = int(v)
        if not (0 <= v <= 59):
            raise ValueError(f"REPORT_MINUTE must be between 0 and 59, got {v}.")
        return v

    @field_validator("EMAIL_SEND_INTERVAL_SECONDS", mode="before")
    @classmethod
    def validate_email_interval(cls, v: Any) -> int:
        """
        Ensures the email send interval is at least 60 seconds.

        Values below 60 seconds risk triggering SMTP provider rate limits and
        increase the probability of the sender IP being flagged for spam.
        """
        v = int(v)
        if v < 60:
            raise ValueError(
                f"EMAIL_SEND_INTERVAL_SECONDS must be at least 60 seconds, got {v}. "
                "Lower values risk SMTP rate-limit violations and spam flags."
            )
        return v

    # Branding and Redirects
    BOOKING_LINK: str = ""
    """
    The booking link.
    """

    SENDER_ADDRESS: str = ""
    """
    The sender address.
    """

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