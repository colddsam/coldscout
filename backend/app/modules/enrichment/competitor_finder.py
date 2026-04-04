"""
Module for competitor discovery.

Executes targeted queries to identify leading market competitors based on rating
and local presence, providing benchmarks for lead qualification.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.lead import Lead

async def find_top_competitor(category: str, city: str, db: AsyncSession) -> dict | None:
    """
    Identifies the highest-rated competitor within the specified category and city.

    Ensures the competitor has an active website and a strong rating baseline (>= 4.0).

    Args:
        category (str): The business category.
        city (str): The target city.
        db (AsyncSession): Active database session.

    Returns:
        dict | None: Dictionary containing the competitor's 'name' and 'website', or None if not found.
    """
    # Validate input parameters to prevent empty category or city
    if not category or not city:
        return None

    # Construct a SQL query to retrieve the top-rated competitor
    # Filter by category, city, website presence, rating, and status
    stmt = select(Lead).where(
        Lead.category == category,  # Filter by business category
        Lead.city == city,  # Filter by target city
        Lead.has_website == True,  # Ensure competitor has an active website
        Lead.rating >= 4.0,  # Ensure competitor has a strong rating baseline
        Lead.status.not_in(['rejected'])  # Exclude rejected competitors
    ).order_by(  # Order results by rating and review count in descending order
        Lead.rating.desc(),
        Lead.review_count.desc()
    ).limit(1)  # Return only the top-rated competitor

    # Execute the query and retrieve the result
    res = await db.execute(stmt)
    competitor = res.scalars().first()

    # Return the competitor's name and website, or None if not found
    if competitor:
        return {
            "name": competitor.business_name,
            "website": competitor.website_url
        }
    return None