"""
Public Lead Directory API — SEO Growth Engine.

Three public, unauthenticated, rate-limited endpoints that expose
aggregated and anonymized lead data for search engine indexing.

Privacy guarantees:
  * Only leads with ``is_public = True`` are returned.
  * Email, phone, qualification_notes, competitor_intel are NEVER
    included in any response.
  * The AI score is converted to an anonymized tier (A/B/C).

Note: we deliberately avoid ``from __future__ import annotations`` here.
slowapi's ``@limiter.limit`` decorator wraps the handler in a way that
forces FastAPI to re-resolve type hints for the request model, and
PEP 563 string-form annotations confuse Pydantic's forward-ref
resolution under that wrapping.
"""

import math
import re
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from loguru import logger
from sqlalchemy import func, select, case
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.lead import Lead
from app.schemas.directory import (
    DirectoryIndustry,
    DirectoryIndustryList,
    DirectoryLeadDetail,
    DirectoryLeadSummary,
    DirectoryListResponse,
    DirectoryLocation,
    DirectoryLocationList,
    DirectoryStats,
)

router = APIRouter(prefix="/directory", tags=["directory"])


# ── Helpers ───────────────────────────────────────────────────────────


def _ai_score_tier(score: int | None) -> str:
    """Convert a raw AI score (0-100) to an anonymized tier letter."""
    if score is None:
        return "C"
    if score >= 80:
        return "A"
    if score >= 50:
        return "B"
    return "C"


def _slugify_category(raw: str) -> str:
    """Normalize a category string into a URL-safe slug form.

    ``Plumber`` → ``plumber``, ``HVAC Contractor`` → ``hvac-contractor``.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", raw.lower().strip())
    return slug.strip("-")


def _deslugify_category(slug: str) -> str:
    """Convert a URL slug back into a category search pattern.

    ``hvac-contractor`` → ``hvac contractor`` (for ILIKE matching).
    """
    return slug.replace("-", " ").strip()


def _deslugify_city(slug: str) -> str:
    """Convert a city slug back into a readable name.

    ``new-york`` → ``new york`` (for ILIKE matching).
    """
    return slug.replace("-", " ").strip()


# ── Routes ────────────────────────────────────────────────────────────


@router.get(
    "/locations",
    response_model=DirectoryLocationList,
    summary="List all locations with public leads",
)
@limiter.limit("60/minute")
async def list_locations(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    country: Optional[str] = Query(None, description="Filter by country code"),
) -> Any:
    """Return grouped city/region/country combinations that have public leads.

    Results are sorted by lead count descending so the most populated
    locations appear first. Useful for the directory index page.
    """
    _ = response  # injected for slowapi

    query = (
        select(
            Lead.city,
            Lead.region,
            Lead.state,
            Lead.country,
            Lead.country_code,
            func.count(Lead.id).label("lead_count"),
        )
        .where(Lead.is_public.is_(True))
        .where(Lead.city.isnot(None))
        .where(Lead.city != "")
        .group_by(Lead.city, Lead.region, Lead.state, Lead.country, Lead.country_code)
        .order_by(func.count(Lead.id).desc())
    )

    if country:
        query = query.where(func.lower(Lead.country_code) == country.lower())

    result = await db.execute(query)
    rows = result.all()

    locations = [
        DirectoryLocation(
            city=row.city or "",
            region=row.region,
            state=row.state,
            country=row.country,
            country_code=row.country_code,
            lead_count=row.lead_count,
        )
        for row in rows
    ]

    return DirectoryLocationList(
        locations=locations,
        total_locations=len(locations),
    )


@router.get(
    "/industries",
    response_model=DirectoryIndustryList,
    summary="List all industries/categories with public leads",
)
@limiter.limit("60/minute")
async def list_industries(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    city: Optional[str] = Query(None, description="Filter by city slug"),
) -> Any:
    """Return grouped industry categories with lead counts.

    Used by the directory index page to show browsable industry chips.
    Optionally filtered by city to show industries available in a
    specific location.
    """
    _ = response

    query = (
        select(
            Lead.category,
            func.count(Lead.id).label("lead_count"),
        )
        .where(Lead.is_public.is_(True))
        .where(Lead.category.isnot(None))
        .where(Lead.category != "")
        .group_by(Lead.category)
        .order_by(func.count(Lead.id).desc())
    )

    if city:
        city_pattern = f"%{_deslugify_city(city)}%"
        query = query.where(Lead.city.ilike(city_pattern))

    result = await db.execute(query)
    rows = result.all()

    industries = [
        DirectoryIndustry(
            category=row.category or "",
            slug=_slugify_category(row.category or ""),
            lead_count=row.lead_count,
        )
        for row in rows
        if row.category  # skip null/empty
    ]

    return DirectoryIndustryList(
        industries=industries,
        total_industries=len(industries),
    )


@router.get(
    "/stats",
    response_model=DirectoryStats,
    summary="Directory-wide statistics for the landing page",
)
@limiter.limit("60/minute")
async def directory_stats(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Return high-level directory statistics.

    Used by the directory index hero section and the main landing page
    to surface aggregate numbers (total leads, cities, industries).
    """
    _ = response

    # Total public leads
    total_leads = (
        await db.execute(
            select(func.count(Lead.id)).where(Lead.is_public.is_(True))
        )
    ).scalar() or 0

    # Total distinct cities
    total_cities = (
        await db.execute(
            select(func.count(func.distinct(Lead.city)))
            .where(Lead.is_public.is_(True))
            .where(Lead.city.isnot(None))
            .where(Lead.city != "")
        )
    ).scalar() or 0

    # Total distinct industries
    total_industries = (
        await db.execute(
            select(func.count(func.distinct(Lead.category)))
            .where(Lead.is_public.is_(True))
            .where(Lead.category.isnot(None))
            .where(Lead.category != "")
        )
    ).scalar() or 0

    # Total distinct countries
    total_countries = (
        await db.execute(
            select(func.count(func.distinct(Lead.country_code)))
            .where(Lead.is_public.is_(True))
            .where(Lead.country_code.isnot(None))
        )
    ).scalar() or 0

    # Top 10 industries
    top_ind_result = await db.execute(
        select(
            Lead.category,
            func.count(Lead.id).label("lead_count"),
        )
        .where(Lead.is_public.is_(True))
        .where(Lead.category.isnot(None))
        .where(Lead.category != "")
        .group_by(Lead.category)
        .order_by(func.count(Lead.id).desc())
        .limit(10)
    )
    top_industries = [
        DirectoryIndustry(
            category=row.category or "",
            slug=_slugify_category(row.category or ""),
            lead_count=row.lead_count,
        )
        for row in top_ind_result.all()
        if row.category
    ]

    # Top 10 locations
    top_loc_result = await db.execute(
        select(
            Lead.city,
            Lead.region,
            Lead.state,
            Lead.country,
            Lead.country_code,
            func.count(Lead.id).label("lead_count"),
        )
        .where(Lead.is_public.is_(True))
        .where(Lead.city.isnot(None))
        .where(Lead.city != "")
        .group_by(Lead.city, Lead.region, Lead.state, Lead.country, Lead.country_code)
        .order_by(func.count(Lead.id).desc())
        .limit(10)
    )
    top_locations = [
        DirectoryLocation(
            city=row.city or "",
            region=row.region,
            state=row.state,
            country=row.country,
            country_code=row.country_code,
            lead_count=row.lead_count,
        )
        for row in top_loc_result.all()
    ]

    return DirectoryStats(
        total_leads=total_leads,
        total_cities=total_cities,
        total_industries=total_industries,
        total_countries=total_countries,
        top_industries=top_industries,
        top_locations=top_locations,
    )


@router.get(
    "/{industry}/{city}",
    response_model=DirectoryListResponse,
    summary="List public leads by industry and city",
)
@limiter.limit("60/minute")
async def list_directory(
    industry: str,
    city: str,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
) -> Any:
    """Return a paginated list of public leads matching the given industry
    and city slugs.

    Industry and city are matched case-insensitively against the
    ``category`` and ``city`` columns using ILIKE so that URL slugs
    like ``plumbers`` match the DB value ``Plumber``.
    """
    _ = response

    category_pattern = f"%{_deslugify_category(industry)}%"
    city_pattern = f"%{_deslugify_city(city)}%"

    base = (
        select(Lead)
        .where(Lead.is_public.is_(True))
        .where(Lead.category.ilike(category_pattern))
        .where(Lead.city.ilike(city_pattern))
    )

    # Count
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    pages = max(1, math.ceil(total / limit))
    offset = (page - 1) * limit

    # Fetch page
    rows_q = (
        base
        .order_by(Lead.rating.desc().nullslast(), Lead.review_count.desc().nullslast())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(rows_q)
    leads = result.scalars().all()

    summaries = [
        DirectoryLeadSummary(
            slug=lead.slug or "",
            business_name=lead.business_name,
            category=lead.category,
            city=lead.city,
            state=lead.state,
            region=lead.region,
            country=lead.country,
            rating=lead.rating,
            review_count=lead.review_count,
            ai_score_tier=_ai_score_tier(lead.ai_score),
            has_website=lead.has_website,
            website_url=lead.website_url,
            google_maps_url=lead.google_maps_url,
            discovered_at=lead.discovered_at,
        )
        for lead in leads
        if lead.slug  # safety: skip leads without slugs
    ]

    # Prettify the industry/city for the response
    display_industry = industry.replace("-", " ").title()
    display_city = city.replace("-", " ").title()

    return DirectoryListResponse(
        leads=summaries,
        total=total,
        page=page,
        pages=pages,
        industry=display_industry,
        city=display_city,
    )


@router.get(
    "/lead/{slug}",
    response_model=DirectoryLeadDetail,
    summary="Get a single public lead by slug",
)
@limiter.limit("120/minute")
async def get_directory_lead(
    slug: str,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Fetch the detailed, privacy-safe profile of a single public lead.

    Returns 404 if the slug doesn't exist or the lead is not public.
    """
    _ = response

    result = await db.execute(
        select(Lead)
        .where(Lead.slug == slug)
        .where(Lead.is_public.is_(True))
    )
    lead = result.scalars().first()

    if not lead:
        raise HTTPException(
            status_code=404,
            detail="Lead not found or not publicly listed.",
        )

    return DirectoryLeadDetail(
        slug=lead.slug or "",
        business_name=lead.business_name,
        category=lead.category,
        address=lead.address,
        city=lead.city,
        state=lead.state,
        region=lead.region,
        country=lead.country,
        country_code=lead.country_code,
        postal_code=lead.postal_code,
        latitude=lead.latitude,
        longitude=lead.longitude,
        rating=lead.rating,
        review_count=lead.review_count,
        ai_score_tier=_ai_score_tier(lead.ai_score),
        has_website=lead.has_website,
        website_url=lead.website_url,
        google_maps_url=lead.google_maps_url,
        is_mobile_responsive=lead.is_mobile_responsive,
        has_online_booking=lead.has_online_booking,
        has_ecommerce=lead.has_ecommerce,
        has_social_media=lead.has_social_media,
        website_title=lead.website_title,
        discovered_at=lead.discovered_at,
    )
