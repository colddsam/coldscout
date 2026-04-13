"""
scripts/fix_manual_schema.py
===========================
Manually adds user_id columns and missing tables if they don't exist.
Used to sync local DB state after partial migration/create_tables conflicts.
"""

import asyncio
import sys
import os

# Ensure the project root is on the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import get_engine
from sqlalchemy import text
from loguru import logger

async def fix_schema():
    engine = get_engine()
    async with engine.begin() as conn:
        logger.info("Attempting to fix missing columns manually...")
        
        tables_to_fix = ["leads", "campaigns", "daily_reports", "search_history"]
        
        for table in tables_to_fix:
            try:
                # Check if user_id column exists (PostgreSQL syntax)
                res = await conn.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :t AND column_name = 'user_id'"
                ), {"t": table})
                
                if not res.fetchone():
                    logger.info(f"Adding user_id column to {table}...")
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER REFERENCES users(id)"))
                else:
                    logger.info(f"user_id already exists in {table}.")

                    
            except Exception as e:
                logger.error(f"Error fixing table {table}: {e}")

        logger.info("Manual schema fix complete.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(fix_schema())
