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
from pathlib import Path
from typing import Any, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Env was consolidated into the repo-root .env on 2026-05-05. Resolve it
# from this file's location so the backend reads the same file regardless
# of CWD (uvicorn from ./backend, docker-compose, Render shell, etc.).
# config.py lives at backend/app/config.py → repo root is parents[2].
_REPO_ROOT_ENV = (Path(__file__).resolve().parents[2] / ".env")
ENV_FILE_PATH = str(_REPO_ROOT_ENV) if _REPO_ROOT_ENV.is_file() else ".env"


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

    ENCRYPTION_KEY: str = ""
    """
    Optional comma-separated list of urlsafe-base64 Fernet keys used to
    encrypt stored API provider credentials. The first key is used for
    new encryptions; later keys allow transparent decryption of older
    rows during rotation (``MultiFernet``).

    When empty, the system falls back to a key derived from APP_SECRET_KEY
    so existing deployments keep working. Rotating APP_SECRET_KEY without
    setting ENCRYPTION_KEY will invalidate every stored credential — set
    ENCRYPTION_KEY explicitly before rotating APP_SECRET_KEY.

    Generate a new key with::
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
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

    # Logging Configuration
    LOG_LEVEL: str = "INFO"
    """
    The minimum level of severity for log messages to be recorded.
    """

    # Attachment Security
    ATTACHMENT_DIR: str | None = None
    """
    The directory where email attachments (PDFs, Excel reports) are stored.
    Defaults to a 'tmp' folder in the backend root.
    """

    @field_validator("ATTACHMENT_DIR", mode="before")
    @classmethod
    def assemble_attachment_dir(cls, v: str | None) -> str:
        """
        Parses the ATTACHMENT_DIR environment variable.
        Ensures it returns an absolute path, defaulting to {backend_root}/tmp.
        """
        if v:
            return os.path.abspath(v)
        
        # Default to {backend_root}/tmp
        backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        default_dir = os.path.join(backend_root, "tmp")
        
        # Ensure the directory exists
        os.makedirs(default_dir, exist_ok=True)
        return default_dir

    IMAGE_BASE_URL: str = ""
    """
    The base URL for image assets.
    """

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    """
    The expiration time for access tokens in minutes.
    """

    SUPERUSER_EMAILS: list[str] | str = []
    """
    A comma-separated list of emails that should be automatically granted
    superuser and admin privileges upon their first Supabase-linked sign-in.
    """

    @field_validator("SUPERUSER_EMAILS", mode="before")
    @classmethod
    def assemble_superuser_emails(cls, v: str | list[str]) -> list[str]:
        """
        Parses the SUPERUSER_EMAILS environment variable.
        """
        if isinstance(v, str):
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

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
        Converts a comma-separated string of origins into a strict list of
        concrete origin strings for the CORS middleware.

        Each origin must be a fully-qualified ``scheme://host[:port]`` value.
        Wildcards (``*``) are rejected because ``allow_credentials=True`` plus
        a wildcard origin is a browser-rejected combination that would
        silently disable CORS for cookie-bearing requests — better to fail
        fast at startup with a clear error than to debug a "CORS not
        working" report in production.

        Args:
            v: The environment variable value.

        Returns:
            A list of allowed origins.

        Raises:
            ValueError: If any origin is a wildcard or unparseable.
        """
        if isinstance(v, str) and not v.startswith("["):
            parts = [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            parts = [str(i).strip() for i in v if str(i).strip()]
        elif isinstance(v, str):
            # Pre-stringified JSON list — pass through; pydantic will parse.
            return v  # type: ignore[return-value]
        else:
            raise ValueError(v)

        from urllib.parse import urlparse
        for origin in parts:
            if origin == "*" or origin.startswith("*"):
                raise ValueError(
                    "BACKEND_CORS_ORIGINS cannot contain '*' — wildcard "
                    "origins are incompatible with allow_credentials=True."
                )
            parsed = urlparse(origin)
            if not parsed.scheme or not parsed.netloc:
                raise ValueError(
                    f"BACKEND_CORS_ORIGINS entry '{origin}' is not a valid "
                    f"absolute origin (expected 'scheme://host[:port]')."
                )
        return parts

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

    GOOGLE_CLIENT_ID: str = ""
    """
    The Google Client ID for OAuth (Calendar integration).
    """

    GOOGLE_CLIENT_SECRET: str = ""
    """
    The Google Client Secret for OAuth.
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
    The hour at which the daily report job fires (0-23, 24-hour format).
    """

    REPORT_MINUTE: int = 30
    """
    The minute within REPORT_HOUR at which the daily report job fires (0-59).
    """

    QUALIFICATION_BATCH_LIMIT: int = 50
    """
    The maximum number of "discovered" leads to process in a single qualification run.
    Helps prevent memory issues and ensures deterministic pipeline performance.
    """

    PERSONALIZATION_BATCH_LIMIT: int = 20
    """
    The maximum number of leads to personalize in a single run.
    Limited to prevent LLM rate-limiting and high memory usage during PDF/Demo generation.
    """

    OUTREACH_BATCH_LIMIT: int = 50
    """
    The maximum number of queued emails to dispatch in a single run.
    Ensures a consistent, human-like sending cadence to protect domain reputation.
    """

    # ── International Discovery Configuration ────────────────────────────────
    DISCOVERY_COUNTRY_FOCUS: str = ""
    """
    Comma-separated ISO 3166-1 alpha-2 codes for target countries.
    Example: "IN,US,AE,GB". Empty string means worldwide (diverse markets).
    """

    DISCOVERY_TARGET_COUNT: int = 4
    """
    Number of location-category targets to generate per daily discovery run.
    Higher values = more API calls = more leads but higher cost.
    """

    DISCOVERY_BATCH_LIMIT: int = 100
    """
    The maximum number of new leads to discover in a single pipeline run.
    Ensures discovery doesn't over-consume API budget or overwhelm subsequent stages.
    """

    DISCOVERY_DEPTH: str = "sub_area"
    """
    How deep the LLM should go when generating location targets.
    Options: "country", "region", "city", "sub_area".
    Deeper = more specific searches = more unique leads.
    """

    DISCOVERY_MAX_PAGES: int = 3
    """
    Maximum Google Places pagination depth per search (1-3).
    Each page returns up to 20 results. 3 pages = 60 results max.
    """

    # ── Demo Website Generation (for no-website leads) ────────────────────────
    GEMINI_API_KEY: str = ""
    """
    Google Gemini API key for generating interactive landing page demos.
    Obtain from Google AI Studio (free tier: 15 RPM, 1500 req/day).
    """

    DEMO_GENERATION_ENABLED: bool = False
    """
    Master kill-switch for demo website generation.
    Set to True only after verifying Gemini API key and testing manually.
    """

    DEMO_MAX_PER_DAY: int = 10
    """
    Maximum number of demo websites to generate per day.
    Keeps usage safely within Gemini free tier limits.
    """

    FRONTEND_DOMAIN: str = "https://coldscout.colddsam.com"
    """
    The public-facing frontend domain used to construct demo URLs in emails.
    """

    REDIRECT_DOMAIN_WHITELIST: str = ""
    """
    Comma-separated list of additional domains allowed for tracking redirects.
    These are merged with the built-in whitelist (calendly.com, linkedin.com, etc.).
    Example: ``mysite.com,client-portal.io``
    """

    # ── Native In-App Video (LiveKit branded meeting rooms) ───────────────────
    # When all three LiveKit values are blank the meeting feature degrades
    # gracefully: the server still boots, every other feature works, and the
    # meeting endpoints return a clear "video not configured" (503). Obtain a
    # project from https://cloud.livekit.io → Settings → Keys.
    LIVEKIT_URL: str = ""
    """LiveKit server URL, e.g. ``wss://your-project.livekit.cloud``. Handed to the browser SDK."""

    LIVEKIT_API_KEY: str = ""
    """LiveKit API key. Used server-side to mint scoped join tokens and verify webhooks."""

    LIVEKIT_API_SECRET: str = ""
    """LiveKit API secret. Treat as a secret — never expose to the frontend."""

    MEETING_HOST_TOKEN_TTL_MINUTES: int = 120
    """Lifetime of a host (freelancer) LiveKit join token."""

    MEETING_GUEST_TOKEN_TTL_MINUTES: int = 120
    """Lifetime of a guest (lead) LiveKit join token."""

    MEETING_INTERVIEW_THRESHOLD_SECONDS: int = 300
    """Live-meeting duration after which the linked lead is auto-advanced to 'interviewed' (5 min)."""

    MEETING_RECORDING_ENABLED: bool = False
    """Master switch for LiveKit Egress recording. Requires Egress + cloud storage configured."""

    MEETING_TRANSCRIPTION_PROVIDER: str = ""
    """Audio→text provider for post-call transcription: '' (off) | 'deepgram' | 'openai'."""

    DEEPGRAM_API_KEY: str = ""
    """Deepgram API key. Required only when MEETING_TRANSCRIPTION_PROVIDER='deepgram'."""

    OPENAI_API_KEY: str = ""
    """OpenAI API key (Whisper). Required only when MEETING_TRANSCRIPTION_PROVIDER='openai'."""

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

    # ── Push Notifications (Web Push + FCM) ───────────────────────────────────
    # When VAPID keys are blank the backend gracefully degrades: in-app
    # notifications still write to the feed, but no Web Push is dispatched
    # (frontend will surface this via the "enable notifications" prompt).
    # Generate a keypair with: ``python -m app.scripts.generate_vapid``
    VAPID_PUBLIC_KEY: str = ""
    """Base64url-encoded uncompressed P-256 public key handed to the browser."""

    VAPID_PRIVATE_KEY: str = ""
    """Base64url-encoded P-256 private key. Treat as a secret."""

    VAPID_SUBJECT: str = "mailto:admin@coldscout.colddsam.com"
    """``mailto:`` or ``https://`` identifier required by the Web Push spec."""

    # FCM service-account JSON for native Android shell. When empty, FCM is
    # skipped and Android-only subscribers won't receive OS-level push (in-app
    # notifications still work). Path to a JSON file OR the JSON string itself.
    FCM_SERVICE_ACCOUNT_JSON: str = ""
    """Either an absolute filesystem path or the raw JSON content of the
    Firebase service-account key. Loaded lazily on first dispatch."""

    FCM_PROJECT_ID: str = ""
    """Firebase project ID. Required only when FCM_SERVICE_ACCOUNT_JSON is set."""

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
        env_file=ENV_FILE_PATH,
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
    DEPRECATED: Use JobManager.is_global_active() instead.
    
    Determines if the system is currently authorized to execute pipeline tasks.
    Maintained as a legacy fallback for non-DB-aware components.
    """
    return os.environ.get("PRODUCTION_STATUS", "RUN").upper()


def set_env_variable(key: str, value: str):
    """
    Updates a given key-value pair in both os.environ (for immediate in-process effect)
    and the .env file (for best-effort persistence across restarts).

    The .env update is atomic: it writes to a sibling temp file and
    ``os.replace``s it over the original, so a process crash mid-write
    cannot leave a truncated .env that fails Pydantic validation on next
    boot. Errors are logged rather than swallowed silently so the
    operator notices a misconfigured filesystem.
    """
    import re
    import tempfile

    # Validate key to prevent injection into .env files
    if not re.match(r'^[A-Z][A-Z0-9_]*$', key):
        raise ValueError(f"Invalid environment variable name: {key}")

    # Update in-process environment so all runtime reads see the change immediately
    os.environ[key] = value

    # Best-effort .env file persistence (useful for local dev, no-op effect on Render).
    env_file = ENV_FILE_PATH
    try:
        existing_lines: list[str] = []
        if os.path.exists(env_file):
            with open(env_file, "r", encoding="utf-8") as f:
                existing_lines = f.readlines()

        key_found = False
        new_lines: list[str] = []
        for line in existing_lines:
            if line.startswith(f"{key}="):
                new_lines.append(f"{key}={value}\n")
                key_found = True
            else:
                new_lines.append(line)
        if not key_found:
            new_lines.append(f"{key}={value}\n")

        # Write to a temp file in the same directory, fsync, then atomic
        # rename. Same-directory placement keeps os.replace atomic on the
        # underlying filesystem.
        target_dir = os.path.dirname(os.path.abspath(env_file)) or "."
        fd, tmp_path = tempfile.mkstemp(prefix=".env.", dir=target_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as tmp:
                tmp.writelines(new_lines)
                tmp.flush()
                try:
                    os.fsync(tmp.fileno())
                except OSError:
                    # fsync isn't supported on every filesystem (e.g. some
                    # network mounts); the replace is still atomic on the
                    # underlying inode swap.
                    pass
            os.replace(tmp_path, env_file)
        except Exception:
            # Clean up temp file so we don't litter the directory on failure.
            if os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
            raise
    except OSError as e:
        # .env write is best-effort; os.environ update above is what matters.
        # Logged (rather than silently swallowed) so a broken FS is visible.
        try:
            from loguru import logger
            logger.warning(f"set_env_variable: failed to persist {key} to .env: {e}")
        except Exception:
            pass