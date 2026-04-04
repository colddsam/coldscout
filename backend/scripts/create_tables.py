import asyncio
import sys
import os

# Ensure the root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from loguru import logger
from app.core.database import get_engine
from app.models import Base

# Ensure all models are imported so Base.metadata knows about them
import app.models.lead
import app.models.campaign
import app.models.email_event
import app.models.daily_report

async def init_db():
    logger.info("Initializing database...")
    engine = get_engine()
    
    try:
        async with engine.begin() as conn:
            logger.info("Creating database tables if they do not exist...")
            await conn.run_sync(Base.metadata.create_all)
            logger.info("Successfully created all database tables! 🚀")
            
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()
        
if __name__ == "__main__":
    asyncio.run(init_db())
