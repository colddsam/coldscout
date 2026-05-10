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
            # Conservative pool settings for Supabase (Session Mode limits to 15 connections)
            # 8 pool + 4 overflow = 12 max per process, leaving room for background tasks.
            engine_args["pool_size"] = 8
            engine_args["max_overflow"] = 4
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
    Checks a sample of tables across features to detect missing schema.

    Raises SystemExit if uninitialized.
    """
    engine = get_engine()
    # Use connect() instead of begin() to avoid automatic transaction start
    async with engine.connect() as conn:
        try:
            # Check for core tables in the information schema. This is faster and avoids 
            # lock contention on the actual tables themselves during high load.
            stmt = text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('leads', 'search_history', 'global_job_configs')
            """)
            res = await conn.execute(stmt)
            found_tables = {row[0] for row in res.all()}
            
            missing = {"leads", "search_history", "global_job_configs"} - found_tables
            if missing:
                raise Exception(f"Missing core tables: {', '.join(missing)}")
        except Exception as e:
            # Check for Postgres ('does not exist') or SQLite ('no such table') errors
            error_str = str(e).lower()
            if "does not exist" in error_str or "no such table" in error_str:
                logger.warning("Database schema is incomplete or uninitialized. Triggering auto-migration...")
                
                import sys
                import subprocess
                try:
                    # Run alembic upgrade head to synchronize schema.
                    # We use sys.executable to ensure we use the same environment.
                    result = subprocess.run(
                        [sys.executable, "-m", "alembic", "upgrade", "head"],
                        check=True,
                        capture_output=True,
                        text=True,
                        timeout=300,  # 5 minutes is plenty for schema changes.
                    )
                    logger.info("Successfully synchronized database schema using Alembic.")
                except subprocess.TimeoutExpired:
                    logger.error("Alembic migration timed out — possible schema lock contention.")
                    # We don't exit here; let the app try to start, though it likely fails.
                except subprocess.CalledProcessError as sub_e:
                    logger.error(f"Auto-migration failed: {sub_e.stderr}")
                    # If migrations fail, we might be in a broken state.
            else:
                logger.error(f"Database health check failed: {e}")
                raise