"""
Advanced Analytics & Insights API.

Endpoints powering the freelancer-facing analytics dashboard.

All routes require an authenticated user; data is strictly scoped to
``current_user.id``.

Routes:
  GET /analytics/funnel?days=30      → FunnelResponse
  GET /analytics/niches?days=90      → list[NicheRow]
  GET /analytics/timing?days=60      → TimingResponse
  GET /analytics/volume?days=30      → list[VolumePoint]
  GET /analytics/advice              → AdviceResponse (Groq-backed)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.modules.analytics.engine import (
    generate_weekly_advice,
    get_funnel_stats,
    get_niche_performance,
    get_sentiment_breakdown,
    get_timing_insights,
    get_volume_timeseries,
)
from app.schemas.analytics import (
    AdviceResponse,
    FunnelResponse,
    NicheRow,
    SentimentResponse,
    TimingResponse,
    VolumePoint,
)

router = APIRouter(prefix="/analytics")


@router.get("/funnel", response_model=FunnelResponse)
async def funnel_stats(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await get_funnel_stats(db, current_user.id, time_range_days=days)


@router.get("/niches", response_model=list[NicheRow])
async def niche_performance(
    days: int = Query(90, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await get_niche_performance(db, current_user.id, time_range_days=days)


@router.get("/timing", response_model=TimingResponse)
async def timing_insights(
    days: int = Query(60, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await get_timing_insights(db, current_user.id, time_range_days=days)


@router.get("/volume", response_model=list[VolumePoint])
async def volume_series(
    days: int = Query(30, ge=1, le=180),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    return await get_volume_timeseries(db, current_user.id, time_range_days=days)


@router.get("/sentiment", response_model=SentimentResponse)
async def sentiment_breakdown(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await get_sentiment_breakdown(db, current_user.id, time_range_days=days)


@router.get("/advice", response_model=AdviceResponse)
async def weekly_advice(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await generate_weekly_advice(db, current_user.id)
