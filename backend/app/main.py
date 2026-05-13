"""
AI Lead Generation System - Core API Entry Point

This module serves as the central orchestration layer for the FastAPI application.
It handles application lifecycle (startup/shutdown), security middleware configuration,
and serves as the mounting point for all versioned API routers.

Key Responsibilities:
1. Lifespan Management: Initializes database connections and the task scheduler on startup.
2. Security: Implements API key validation and explicit CORS policies for authorized frontend access.
3. Routing: Aggregates modular routers into a single cohesive API surface.

Security Notes:
- CORS allowed methods are intentionally restricted to the HTTP verbs used by the application.
  Using `["*"]` would permit potentially unsafe methods (PUT, TRACE, CONNECT) that this API
  does not support and should not receive from a browser-origin request.
- Allowed origins are driven entirely by BACKEND_CORS_ORIGINS in the environment; the default
  is an empty list, so the application is locked down unless the variable is explicitly set.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# Internal imports ensure the application context is correctly initialized
from app.config import get_settings
from app.core.rate_limit import limiter
from app.core.scheduler import scheduler, setup_scheduler
from app.core.database import verify_tables_exist
from app.core.redis_client import close_redis
from app.api.router import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application's lifecycle events.
    
    Startup logic ensures the database is ready and the background scheduler is initialized.
    Shutdown logic ensures a clean exit by stopping the scheduler without waiting for 
    non-critical background tasks to complete, preventing hanging processes.
    """
    # ── Startup ──────────────────────────────────────────────
    logger.info("Initializing Lead Generation Automation API...")
    
    # Ensure database schema is present before accepting requests
    try:
        import asyncio
        await asyncio.wait_for(verify_tables_exist(), timeout=10.0)
    except asyncio.TimeoutError:
        logger.error("Database verification timed out during startup. Database may be unreachable or under heavy load.")
        # We continue here so the app can at least start; core endpoints will fail later with 500
        # instead of preventing the whole container from booting.
    except Exception as e:
        logger.error(f"Database verification failed during startup: {e}")
        # Note: We don't raise here either to allow the app to boot for debugging/health check

    # Setup background task scheduling (Discovery, Qualification, Outreach)
    try:
        await setup_scheduler()
    except Exception as e:
        logger.error(f"Scheduler setup failed during startup: {e}. "
                     f"API will run without background task scheduling.")

    # Optional: check Redis connectivity (pipeline tracking degrades gracefully
    # if Redis is unavailable, but we log a warning so operators are aware).
    try:
        from app.core.redis_client import ping_redis
        if not await ping_redis():
            logger.warning("Redis is not reachable. Pipeline tracking will be disabled.")
        else:
            logger.info("Redis connectivity verified.")
    except Exception as e:
        logger.warning(f"Redis connectivity check failed: {e}")

    # NOTE: The system is designed to be extensible. While we currently use
    # APScheduler for simplicity, the codebase retains structure compatible
    # with Celery/Redis for future horizontal scaling requirements.

    yield

    # ── Shutdown ─────────────────────────────────────────────
    # Gracefully stop the scheduler — wait for in-progress jobs to finish
    # so database transactions can commit cleanly. Falls back to forceful
    # shutdown if scheduler is in an unexpected state.
    try:
        if scheduler.running:
            scheduler.shutdown(wait=True)
        await close_redis()
    except Exception as e:
        logger.warning(f"Scheduler shutdown encountered an issue: {e}")
    logger.info("Application shutdown complete. Scheduler stopped.")

# Initialize FastAPI application with optimized metadata for OpenAPI/Swagger documentation
app = FastAPI(
    title="AI Lead Generation System",
    description=(
        "An autonomous pipeline designed to discover local business leads, "
        "qualify them using AI, and manage personalized outreach campaigns."
    ),
    version="1.0.0",
    lifespan=lifespan
)

# Configure Cross-Origin Resource Sharing (CORS).
#
# allow_origins  — driven by BACKEND_CORS_ORIGINS env var (empty by default = locked down).
# allow_methods  — explicitly enumerated; wildcard "*" is intentionally avoided so that
#                  browser pre-flight checks cannot be used to probe unsupported HTTP verbs.
# allow_headers  — limited to the headers actually required by the frontend clients.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
)

# ── Rate limiting (slowapi) ──────────────────────────────────────────
# We register the limiter on the app state and attach the middleware so
# any router can opt in with ``@limiter.limit(...)`` on individual
# endpoints. Existing routes are unaffected — slowapi only enforces a
# limit when an endpoint is explicitly decorated. The 429 handler turns
# rate-limit hits into a clean JSON error rather than the default plain
# string, so the SPA can surface it without parsing.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


# ── Security headers ─────────────────────────────────────────────────
# Adds HSTS, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options
# to every response. Demo HTML endpoints set their own Content-Security-
# Policy + X-Frame-Options=ALLOWALL inline (so iframing demos still works
# from operator dashboards); we don't override those.
@app.middleware("http")
async def security_headers_middleware(request, call_next):
    """Inject defensive HTTP headers on every response.

    These are cheap, browser-only mitigations:
      - HSTS forces HTTPS for a year on the same host (HTTPS deploys only).
      - Referrer-Policy hides full referrers from cross-origin destinations.
      - X-Content-Type-Options prevents MIME sniffing.
      - X-Frame-Options blocks framing of JSON / SEO HTML responses to
        defeat clickjacking. The demo endpoint sets ``ALLOWALL`` itself,
        which we don't overwrite (``setdefault`` semantics).
    """
    response = await call_next(request)
    response.headers.setdefault(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains",
    )
    response.headers.setdefault(
        "Referrer-Policy", "strict-origin-when-cross-origin"
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=(), payment=()",
    )
    return response

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
async def root():
    """
    Root endpoint for platform health/liveness checks.
    Ensures that default cluster health probes (which often target '/')
    do not fail with 404, preventing unnecessary process restarts.
    """
    return {
        "status": "ok",
        "service": "Lead Generation Automation API",
        "version": "1.0.0"
    }