"""
Database connection and session management module.

Provides async connection pooling and session makers for PostgreSQL.
"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from functools import lru_cache

from app.config import get_settings
from sqlalchemy import text
from loguru import logger

from app.models.base import Base

_engine = None
_async_session_maker = None


def get_engine():
    """
    Initializes and retrieves the global async SQLAlchemy engine.

    Establishes connection pool settings.

    :return: The global async SQLAlchemy engine.
    """
    global _engine

    if _engine is None:
        settings = get_settings()

        engine_args = {
            "echo": False,
            "future": True,
            "pool_pre_ping": True,
            "pool_recycle": 1800,
        }

        if not settings.DATABASE_URL.startswith("sqlite"):
            engine_args["pool_size"] = 10
            engine_args["max_overflow"] = 20
            # Required for Supabase PgBouncer (Transaction Pooler)
            engine_args["connect_args"] = {"prepared_statement_cache_size": 0}

        _engine = create_async_engine(
            settings.DATABASE_URL,
            **engine_args
        )

    return _engine


def get_session_maker():
    """
    Initializes and retrieves the global async session maker factory.

    :return: The global async session maker factory.
    """
    global _async_session_maker

    if _async_session_maker is None:
        _async_session_maker = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )

    return _async_session_maker


async def get_db():
    """
    Async dependency to acquire and release isolated database sessions.

    :yield: An isolated database session.
    """
    async_session = get_session_maker()
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def verify_tables_exist():
    """
    Verifies that required core application tables exist in the database.

    Raises SystemExit if uninitialized.

    :raises SystemExit: If database tables are missing or uninitialized.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        try:
            await conn.execute(text("SELECT id FROM public.leads LIMIT 1"))
            await conn.execute(text("SELECT id FROM public.search_history LIMIT 1"))
        except Exception as e:
            # Check for Postgres ('does not exist') or SQLite ('no such table') errors
            error_str = str(e).lower()
            if "does not exist" in error_str or "no such table" in error_str:
                logger.warning("Database tables are missing or uninitialized. Attempting auto-creation...")
                
                import sys
                import subprocess
                try:
                    result = subprocess.run(
                        [sys.executable, "-m", "alembic", "upgrade", "head"],
                        check=True,
                        capture_output=True,
                        text=True,
                        timeout=120,
                    )
                    logger.info("Successfully provisioned database schema using Alembic!")
                    logger.debug(f"Alembic output: {result.stdout}")
                except subprocess.TimeoutExpired:
                    error_msg = "Alembic migration timed out after 120s — possible schema lock contention."
                    logger.error(error_msg)
                    sys.exit(error_msg)
                except subprocess.CalledProcessError as sub_e:
                    error_msg = f"Auto-creation failed during alembic upgrade: {sub_e.stderr}"
                    logger.error(error_msg)
                    sys.exit(error_msg)
            else:
                raise