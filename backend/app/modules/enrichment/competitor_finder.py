"""
Module for competitor discovery.

Executes targeted queries to identify leading market competitors based on rating
and local presence, providing benchmarks for lead qualification.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.lead import Lead

async def find_top_competitor(
    category: str,
    city: str,
    db: AsyncSession,
    country_code: str = None,
) -> dict | None:
    """
    Identifies the highest-rated competitor within the specified category and city.

    Ensures the competitor has an active website and a strong rating baseline (>= 4.0).
    When country_code is provided, filters by country to avoid cross-country matches
    for cities with the same name (e.g., "Richmond" in US vs UK).

    Args:
        category: The business category.
        city: The target city.
        db: Active database session.
        country_code: ISO 3166-1 alpha-2 code for country-level disambiguation.

    Returns:
        dict | None: Dictionary containing the competitor's 'name' and 'website', or None if not found.
    """
    if not category or not city:
        return None

    stmt = select(Lead).where(
        Lead.category == category,
        Lead.city == city,
        Lead.has_website == True,
        Lead.rating >= 4.0,
        Lead.status.not_in(['rejected']),
    )
    if country_code:
        stmt = stmt.where(Lead.country_code == country_code.upper())

    stmt = stmt.order_by(
        Lead.rating.desc(),
        Lead.review_count.desc(),
    ).limit(1)

    res = await db.execute(stmt)
    competitor = res.scalars().first()

    if competitor:
        return {
            "name": competitor.business_name,
            "website": competitor.website_url,
        }
    return None