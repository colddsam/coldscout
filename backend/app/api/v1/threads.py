"""
Threads API Endpoints.

Provides REST API routes for the Threads lead generation system:
  - OAuth callback for token exchange (public)
  - Search config management (CRUD) — per freelancer
  - Manual pipeline triggers — per freelancer
  - Stats and metrics — per freelancer
  - Lead listing and engagement history — per freelancer

All routes under /api/v1/threads/ are protected by API key authentication
(registered in the private router) AND scoped to the authenticated freelancer
via ``get_current_user``. The OAuth callback is the only exception — it uses
state-token cookies to bind the incoming redirect to the user who initiated
the flow (see oauth_callback docstring).
"""
import base64
import hashlib
import hmac
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select, func

from app.api.deps import get_current_user
from app.config import get_settings
from app.core.database import get_session_maker
from app.models.threads import (
    ThreadsProfile, ThreadsPost, ThreadsEngagement, ThreadsSearchConfig,
)
from app.models.user import User
from app.modules.threads.client import ThreadsAPIClient
from app.modules.threads.token_manager import ThreadsTokenManager
from app.modules.threads.rate_limiter import ThreadsRateLimiter
from app.modules.threads.discovery import run_threads_discovery
from app.modules.threads.qualifier import run_threads_qualification
from app.modules.threads.engagement import run_threads_engagement, check_engagement_responses


# ── OAuth state signing ──────────────────────────────────────────
#
# The Threads OAuth callback is unauthenticated by design (Meta redirects
# straight to it after the user approves the app). To bind the incoming
# code to the freelancer who *initiated* the flow we sign the state value
# with the application's SECURITY_SALT. An attacker who tries to forge a
# callback URL with a chosen ``state`` won't have the secret, so the HMAC
# check fails and we reject the request rather than silently writing the
# token under the wrong user.

def _build_threads_oauth_state(user_id: int) -> str:
    """Return ``"{user_id}.{base64-hmac}"`` — bind the OAuth flow to a user."""
    payload = str(int(user_id)).encode("utf-8")
    sig = hmac.new(
        settings.SECURITY_SALT.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).digest()
    return f"{payload.decode()}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"


def _parse_threads_oauth_state(state: str | None) -> int | None:
    """Validate the signed state token from the OAuth callback.

    Returns the user_id when the signature matches; otherwise None.
    Returning None — rather than raising — keeps the legacy
    "no state-bound user" path intact: callers may still proceed in
    single-tenant mode, but a *forged* state will never resolve to a
    user_id and cannot redirect tokens to a victim's account.
    """
    if not state or "." not in state:
        return None
    payload, b64_sig = state.split(".", 1)
    try:
        # Re-pad URL-safe base64 before decoding
        padded = b64_sig + "=" * (-len(b64_sig) % 4)
        provided_sig = base64.urlsafe_b64decode(padded.encode("utf-8"))
    except Exception:
        return None

    expected = hmac.new(
        settings.SECURITY_SALT.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(provided_sig, expected):
        return None
    try:
        return int(payload)
    except ValueError:
        return None

settings = get_settings()

# Two routers: public (OAuth callback) and private (everything else)
public_router = APIRouter(prefix="/threads")
router = APIRouter(prefix="/threads")


# ── Pydantic Schemas ────────────────────────────────────────────

class SearchConfigCreate(BaseModel):
    keyword: str
    category: str | None = None
    search_type: str = "RECENT"
    max_results_per_search: int = 25


class SearchConfigUpdate(BaseModel):
    keyword: str | None = None
    category: str | None = None
    search_type: str | None = None
    is_active: bool | None = None
    max_results_per_search: int | None = None


# ── OAuth Callback (PUBLIC — no API key) ────────────────────────

@public_router.get("/oauth/callback")
async def oauth_callback(code: str, state: str | None = None):
    """
    Handles the OAuth redirect from Meta after the user authorizes the app.
    Exchanges the auth code for tokens and stores them.

    NOTE: The originating freelancer's ``user_id`` is bound to the flow via
    a signed ``state`` parameter (HMAC over user_id with SECURITY_SALT).
    A forged or unsigned state resolves to ``None`` and the token is stored
    with ``user_id=NULL`` rather than under an attacker-chosen user id —
    this prevents an OAuth-confused-deputy attack where a victim's account
    would otherwise be linked to the attacker's Threads identity.
    """
    try:
        # Validate the signed state token. ``None`` is acceptable for
        # single-tenant / legacy callers; only a *valid signature* maps the
        # incoming code to a specific freelancer.
        initiating_user_id: int | None = _parse_threads_oauth_state(state)
        if state and initiating_user_id is None:
            logger.warning(
                "Threads OAuth callback received with invalid state signature; "
                "storing token without user binding."
            )

        short_lived = await ThreadsAPIClient.exchange_code_for_short_lived_token(code)
        short_token = short_lived.get("access_token")
        threads_uid = str(short_lived.get("user_id", ""))

        if not short_token:
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code.")

        long_lived = await ThreadsAPIClient.exchange_for_long_lived_token(short_token)

        token_mgr = ThreadsTokenManager()
        await token_mgr.store_token(
            threads_user_id=threads_uid,
            access_token=long_lived["access_token"],
            token_type="long_lived",
            expires_in=long_lived.get("expires_in", 5184000),
            user_id=initiating_user_id,
        )

        return {
            "status": "success",
            "message": "Threads authorization complete. Token stored securely.",
            "threads_user_id": threads_uid,
        }

    except HTTPException:
        raise
    except Exception:
        # Never leak raw SDK error strings to anonymous callers — they may
        # contain internal IDs, partial URLs, or library tracebacks. Log
        # the detail server-side, return a generic message to the browser.
        logger.exception("Threads OAuth callback failed")
        raise HTTPException(status_code=500, detail="OAuth exchange failed.")


# ── OAuth Initiation (PRIVATE — provides a signed state) ──────────

@router.get("/oauth/start")
async def threads_oauth_start(current_user: User = Depends(get_current_user)):
    """Returns a signed OAuth ``state`` parameter for the authenticated user.

    The frontend uses this value when constructing the Meta OAuth URL so
    that, on callback, the server can prove which freelancer initiated
    the flow and bind the token to their account.
    """
    return {
        "user_id": current_user.id,
        "state": _build_threads_oauth_state(current_user.id),
    }


# ── Search Config Management (PRIVATE) ──────────────────────────

@router.get("/search-configs")
async def list_search_configs(current_user: User = Depends(get_current_user)):
    """List the current freelancer's Threads keyword search configurations."""
    async with get_session_maker()() as db:
        result = await db.execute(
            select(ThreadsSearchConfig)
            .where(ThreadsSearchConfig.user_id == current_user.id)
            .order_by(ThreadsSearchConfig.created_at.desc())
        )
        configs = result.scalars().all()
        return [
            {
                "id": str(c.id),
                "keyword": c.keyword,
                "category": c.category,
                "search_type": c.search_type,
                "is_active": c.is_active,
                "max_results_per_search": c.max_results_per_search,
                "last_searched_at": c.last_searched_at.isoformat() if c.last_searched_at else None,
            }
            for c in configs
        ]


@router.post("/search-configs")
async def create_search_config(
    data: SearchConfigCreate,
    current_user: User = Depends(get_current_user),
):
    """Create a new keyword search configuration owned by the current freelancer."""
    async with get_session_maker()() as db:
        try:
            config = ThreadsSearchConfig(
                user_id=current_user.id,
                keyword=data.keyword,
                category=data.category,
                search_type=data.search_type,
                max_results_per_search=data.max_results_per_search,
            )
            db.add(config)
            await db.commit()
            await db.refresh(config)
            return {"id": str(config.id), "keyword": config.keyword, "status": "created"}
        except Exception as e:
            await db.rollback()
            logger.error("Failed to create search config: %s", e)
            raise HTTPException(status_code=500, detail="Database transaction failed.")


@router.put("/search-configs/{config_id}")
async def update_search_config(
    config_id: str,
    data: SearchConfigUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update an existing search configuration owned by the current freelancer."""
    async with get_session_maker()() as db:
        result = await db.execute(
            select(ThreadsSearchConfig)
            .where(
                ThreadsSearchConfig.id == config_id,
                ThreadsSearchConfig.user_id == current_user.id,
            )
        )
        config = result.scalars().first()
        if not config:
            raise HTTPException(status_code=404, detail="Search config not found.")

        if data.keyword is not None:
            config.keyword = data.keyword
        if data.category is not None:
            config.category = data.category
        if data.search_type is not None:
            config.search_type = data.search_type
        if data.is_active is not None:
            config.is_active = data.is_active
        if data.max_results_per_search is not None:
            config.max_results_per_search = data.max_results_per_search

        try:
            await db.commit()
            return {"id": str(config.id), "status": "updated"}
        except Exception as e:
            await db.rollback()
            logger.error("Failed to update search config: %s", e)
            raise HTTPException(status_code=500, detail="Database transaction failed.")


@router.delete("/search-configs/{config_id}")
async def delete_search_config(
    config_id: str,
    current_user: User = Depends(get_current_user),
):
    """Delete a search configuration owned by the current freelancer."""
    async with get_session_maker()() as db:
        result = await db.execute(
            select(ThreadsSearchConfig)
            .where(
                ThreadsSearchConfig.id == config_id,
                ThreadsSearchConfig.user_id == current_user.id,
            )
        )
        config = result.scalars().first()
        if not config:
            raise HTTPException(status_code=404, detail="Search config not found.")
        
        try:
            await db.delete(config)
            await db.commit()
            return {"status": "deleted"}
        except Exception as e:
            await db.rollback()
            logger.error("Failed to delete search config: %s", e)
            raise HTTPException(status_code=500, detail="Database transaction failed.")


# ── Manual Pipeline Triggers (PRIVATE) ──────────────────────────

@router.post("/run/discovery")
async def trigger_discovery(current_user: User = Depends(get_current_user)):
    """Manually trigger the Threads discovery stage for the current freelancer."""
    result = await run_threads_discovery(user_id=current_user.id)
    return result


@router.post("/run/qualification")
async def trigger_qualification(current_user: User = Depends(get_current_user)):
    """Manually trigger the Threads qualification stage for the current freelancer."""
    result = await run_threads_qualification(user_id=current_user.id)
    return result


@router.post("/run/engagement")
async def trigger_engagement(current_user: User = Depends(get_current_user)):
    """Manually trigger the Threads engagement stage for the current freelancer."""
    result = await run_threads_engagement(user_id=current_user.id)
    return result


@router.post("/run/check-responses")
async def trigger_check_responses(current_user: User = Depends(get_current_user)):
    """Manually trigger checking for engagement responses for the current freelancer."""
    result = await check_engagement_responses(user_id=current_user.id)
    return result


# ── Threads Profiles & Stats (PRIVATE) ──────────────────────────

@router.get("/profiles")
async def list_profiles(
    status: str | None = Query(None, description="Filter by qualification_status"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    current_user: User = Depends(get_current_user),
):
    """List this freelancer's discovered Threads profiles with optional filtering."""
    async with get_session_maker()() as db:
        stmt = (
            select(ThreadsProfile)
            .where(ThreadsProfile.user_id == current_user.id)
            .order_by(ThreadsProfile.created_at.desc())
        )
        if status:
            stmt = stmt.where(ThreadsProfile.qualification_status == status)
        stmt = stmt.limit(limit).offset(offset)

        result = await db.execute(stmt)
        profiles = result.scalars().all()

        return [
            {
                "id": str(p.id),
                "threads_user_id": p.threads_user_id,
                "username": p.username,
                "name": p.name,
                "bio": p.bio[:200] if p.bio else None,
                "followers_count": p.followers_count,
                "is_verified": p.is_verified,
                "qualification_status": p.qualification_status,
                "ai_score": p.ai_score,
                "qualification_notes": p.qualification_notes,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in profiles
        ]


@router.get("/stats")
async def get_threads_stats(current_user: User = Depends(get_current_user)):
    """Get this freelancer's Threads pipeline statistics and rate-limiter status."""
    rate_limiter = ThreadsRateLimiter()
    daily_stats = await rate_limiter.get_daily_stats(user_id=current_user.id)

    async with get_session_maker()() as db:
        def _scoped_count(model, *extra):
            stmt = select(func.count(model.id)).where(model.user_id == current_user.id)
            for clause in extra:
                stmt = stmt.where(clause)
            return stmt

        total_profiles = (await db.execute(_scoped_count(ThreadsProfile))).scalar() or 0
        qualified = (await db.execute(
            _scoped_count(ThreadsProfile, ThreadsProfile.qualification_status == "qualified")
        )).scalar() or 0
        engaged = (await db.execute(
            _scoped_count(ThreadsProfile, ThreadsProfile.qualification_status == "engaged")
        )).scalar() or 0

        # ThreadsPost inherits scope via its owning profile.
        total_posts = (await db.execute(
            select(func.count(ThreadsPost.id))
            .join(ThreadsProfile, ThreadsPost.threads_profile_id == ThreadsProfile.id)
            .where(ThreadsProfile.user_id == current_user.id)
        )).scalar() or 0

        total_engagements = (await db.execute(_scoped_count(ThreadsEngagement))).scalar() or 0

    return {
        "threads_enabled": settings.THREADS_ENABLED,
        "profiles": {
            "total": total_profiles,
            "qualified": qualified,
            "engaged": engaged,
        },
        "posts": total_posts,
        "engagements": total_engagements,
        "rate_limiter": daily_stats,
    }


@router.get("/engagements")
async def list_engagements(
    status: str | None = Query(None),
    limit: int = Query(50, le=100),
    current_user: User = Depends(get_current_user),
):
    """List this freelancer's engagement history."""
    async with get_session_maker()() as db:
        stmt = (
            select(ThreadsEngagement)
            .where(ThreadsEngagement.user_id == current_user.id)
            .order_by(ThreadsEngagement.created_at.desc())
        )
        if status:
            stmt = stmt.where(ThreadsEngagement.status == status)
        stmt = stmt.limit(limit)

        result = await db.execute(stmt)
        engagements = result.scalars().all()

        return [
            {
                "id": str(e.id),
                "threads_profile_id": str(e.threads_profile_id),
                "reply_text": e.reply_text[:200] if e.reply_text else None,
                "status": e.status,
                "replied_at": e.replied_at.isoformat() if e.replied_at else None,
                "response_text": e.response_text[:200] if e.response_text else None,
                "response_received_at": (
                    e.response_received_at.isoformat() if e.response_received_at else None
                ),
            }
            for e in engagements
        ]
