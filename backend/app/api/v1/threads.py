"""
Threads API Endpoints.

Provides REST API routes for the Threads lead generation system:
  - OAuth callback for token exchange
  - Search config management (CRUD)
  - Manual pipeline triggers
  - Stats and metrics
  - Lead listing and engagement history

All routes under /api/v1/threads/ are protected by API key authentication
(registered in the private router) except the OAuth callback.
"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select, func

from app.config import get_settings
from app.core.database import get_session_maker
from app.models.threads import (
    ThreadsProfile, ThreadsPost, ThreadsEngagement, ThreadsSearchConfig,
)
from app.modules.threads.client import ThreadsAPIClient
from app.modules.threads.token_manager import ThreadsTokenManager
from app.modules.threads.rate_limiter import ThreadsRateLimiter
from app.modules.threads.discovery import run_threads_discovery
from app.modules.threads.qualifier import run_threads_qualification
from app.modules.threads.engagement import run_threads_engagement, check_engagement_responses

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
async def oauth_callback(code: str):
    """
    Handles the OAuth redirect from Meta after the user authorizes the app.
    Exchanges the auth code for tokens and stores them.
    """
    try:
        # Step 1: Exchange code for short-lived token
        short_lived = await ThreadsAPIClient.exchange_code_for_short_lived_token(code)
        short_token = short_lived.get("access_token")
        user_id = str(short_lived.get("user_id", ""))

        if not short_token:
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code.")

        # Step 2: Exchange for long-lived token
        long_lived = await ThreadsAPIClient.exchange_for_long_lived_token(short_token)

        # Step 3: Store in database
        token_mgr = ThreadsTokenManager()
        await token_mgr.store_token(
            threads_user_id=user_id,
            access_token=long_lived["access_token"],
            token_type="long_lived",
            expires_in=long_lived.get("expires_in", 5184000),
        )

        return {
            "status": "success",
            "message": "Threads authorization complete. Token stored securely.",
            "threads_user_id": user_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Threads OAuth callback failed")
        raise HTTPException(status_code=500, detail=str(e))


# ── Search Config Management (PRIVATE) ──────────────────────────

@router.get("/search-configs")
async def list_search_configs():
    """List all Threads keyword search configurations."""
    async with get_session_maker()() as db:
        result = await db.execute(
            select(ThreadsSearchConfig).order_by(ThreadsSearchConfig.created_at.desc())
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
async def create_search_config(data: SearchConfigCreate):
    """Create a new keyword search configuration."""
    async with get_session_maker()() as db:
        config = ThreadsSearchConfig(
            keyword=data.keyword,
            category=data.category,
            search_type=data.search_type,
            max_results_per_search=data.max_results_per_search,
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
        return {"id": str(config.id), "keyword": config.keyword, "status": "created"}


@router.put("/search-configs/{config_id}")
async def update_search_config(config_id: str, data: SearchConfigUpdate):
    """Update an existing search configuration."""
    async with get_session_maker()() as db:
        result = await db.execute(
            select(ThreadsSearchConfig).where(ThreadsSearchConfig.id == config_id)
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

        await db.commit()
        return {"id": str(config.id), "status": "updated"}


@router.delete("/search-configs/{config_id}")
async def delete_search_config(config_id: str):
    """Delete a search configuration."""
    async with get_session_maker()() as db:
        result = await db.execute(
            select(ThreadsSearchConfig).where(ThreadsSearchConfig.id == config_id)
        )
        config = result.scalars().first()
        if not config:
            raise HTTPException(status_code=404, detail="Search config not found.")
        await db.delete(config)
        await db.commit()
        return {"status": "deleted"}


# ── Manual Pipeline Triggers (PRIVATE) ──────────────────────────

@router.post("/run/discovery")
async def trigger_discovery():
    """Manually trigger the Threads discovery stage."""
    result = await run_threads_discovery()
    return result


@router.post("/run/qualification")
async def trigger_qualification():
    """Manually trigger the Threads qualification stage."""
    result = await run_threads_qualification()
    return result


@router.post("/run/engagement")
async def trigger_engagement():
    """Manually trigger the Threads engagement stage."""
    result = await run_threads_engagement()
    return result


@router.post("/run/check-responses")
async def trigger_check_responses():
    """Manually trigger checking for engagement responses."""
    result = await check_engagement_responses()
    return result


# ── Threads Profiles & Stats (PRIVATE) ──────────────────────────

@router.get("/profiles")
async def list_profiles(
    status: str | None = Query(None, description="Filter by qualification_status"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
):
    """List discovered Threads profiles with optional filtering."""
    async with get_session_maker()() as db:
        stmt = select(ThreadsProfile).order_by(ThreadsProfile.created_at.desc())
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
async def get_threads_stats():
    """Get Threads pipeline statistics and rate limiter status."""
    rate_limiter = ThreadsRateLimiter()
    daily_stats = await rate_limiter.get_daily_stats()

    async with get_session_maker()() as db:
        total_profiles = (await db.execute(
            select(func.count(ThreadsProfile.id))
        )).scalar() or 0

        qualified = (await db.execute(
            select(func.count(ThreadsProfile.id))
            .where(ThreadsProfile.qualification_status == "qualified")
        )).scalar() or 0

        engaged = (await db.execute(
            select(func.count(ThreadsProfile.id))
            .where(ThreadsProfile.qualification_status == "engaged")
        )).scalar() or 0

        total_posts = (await db.execute(
            select(func.count(ThreadsPost.id))
        )).scalar() or 0

        total_engagements = (await db.execute(
            select(func.count(ThreadsEngagement.id))
        )).scalar() or 0

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
):
    """List engagement history."""
    async with get_session_maker()() as db:
        stmt = select(ThreadsEngagement).order_by(ThreadsEngagement.created_at.desc())
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
