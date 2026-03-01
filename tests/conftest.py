import os
import pytest
import pytest_asyncio

from sqlalchemy import pool

# MUST SET BEFORE IMPORTING APP OR SETTINGS
TEST_DB_URL = os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ["DATABASE_URL"] = TEST_DB_URL

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core import database
from app.models import Base
from app.models.lead import Lead, SearchHistory
from app.models.campaign import Campaign
from app.models.email_event import EmailEvent
from app.main import app

connect_args = {}
if "sqlite" in TEST_DB_URL:
    connect_args["check_same_thread"] = False

test_engine = create_async_engine(
    TEST_DB_URL,
    echo=False,
    future=True,
    connect_args=connect_args,
    poolclass=pool.NullPool,
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

@pytest_asyncio.fixture(scope="function")
async def db_session():
    # Hijack the base database module globals for direct function calls
    old_engine = database._engine
    old_session_maker = database._async_session_maker
    database._engine = test_engine
    database._async_session_maker = TestingSessionLocal
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with TestingSessionLocal() as session:
        yield session
    
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        
    # Restore
    database._engine = old_engine
    database._async_session_maker = old_session_maker

@pytest.fixture(scope="function")
def override_get_db(db_session):
    async def _override_get_db():
        yield db_session
    return _override_get_db

@pytest_asyncio.fixture(scope="function")
async def client(override_get_db):
    app.dependency_overrides[database.get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
