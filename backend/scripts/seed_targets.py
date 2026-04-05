"""
Seeds initial target locations for the automated discovery pipeline.

Provides a diverse set of international locations to bootstrap the system
before the LLM-driven target generation takes over.
"""
import asyncio
import os
import sys

# Add parent dir to path so we can import app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.database import get_session_maker
import app.models
from app.models.lead import SearchHistory


async def seed_locations():
    """
    Seeds initial SearchHistory entries so the pipeline has international
    diversity from day one. These entries act as both seed data and
    exclusion markers so the LLM generates complementary targets.
    """
    locations = [
        # India — existing market
        {
            "country": "India", "country_code": "IN",
            "region": "West Bengal", "city": "Kolkata", "sub_area": "Salt Lake",
            "category": "Bakery", "location_depth": "sub_area",
        },
        {
            "country": "India", "country_code": "IN",
            "region": "Maharashtra", "city": "Mumbai", "sub_area": "Bandra West",
            "category": "Jewelry Store", "location_depth": "sub_area",
        },
        # United States
        {
            "country": "United States", "country_code": "US",
            "region": "Texas", "city": "Austin", "sub_area": "East Austin",
            "category": "Yoga Studios", "location_depth": "sub_area",
        },
        {
            "country": "United States", "country_code": "US",
            "region": "Oregon", "city": "Portland", "sub_area": "Pearl District",
            "category": "Coffee Roasters", "location_depth": "sub_area",
        },
        # United Arab Emirates
        {
            "country": "United Arab Emirates", "country_code": "AE",
            "region": "Dubai", "city": "Dubai", "sub_area": "Deira",
            "category": "Tailoring Shops", "location_depth": "sub_area",
        },
        # United Kingdom
        {
            "country": "United Kingdom", "country_code": "GB",
            "region": "England", "city": "London", "sub_area": "Shoreditch",
            "category": "Barbershops", "location_depth": "sub_area",
        },
        # Australia
        {
            "country": "Australia", "country_code": "AU",
            "region": "Victoria", "city": "Melbourne", "sub_area": "Fitzroy",
            "category": "Pet Clinics", "location_depth": "sub_area",
        },
    ]

    async with get_session_maker()() as db:
        for loc_data in locations:
            entry = SearchHistory(**loc_data)
            db.add(entry)

        await db.commit()
        print(f"Seeded {len(locations)} international target locations.")


if __name__ == "__main__":
    asyncio.run(seed_locations())
