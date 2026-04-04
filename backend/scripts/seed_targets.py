import asyncio
import os
import sys

# Add parent dir to path so we can import app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.core.database import get_session_maker
import app.models
from app.models.lead import TargetLocation

async def seed_locations():
    """
    Seeds initial target locations for the automated pipeline to scan.
    """
    locations = [
        {
            "city": "Kolkata",
            "categories": ["bakery", "restaurant", "clothing_store", "florist"],
            "radius_meters": 5000,
            "is_active": True
        },
        {
            "city": "Mumbai",
            "categories": ["electronics_store", "home_goods_store", "jewelry_store"],
            "radius_meters": 5000,
            "is_active": True
        }
    ]
    
    async with get_session_maker()() as db:
        for loc_data in locations:
            loc = TargetLocation(**loc_data)
            db.add(loc)
            
        await db.commit()
        print(f"Seeded {len(locations)} target locations.")

if __name__ == "__main__":
    asyncio.run(seed_locations())
