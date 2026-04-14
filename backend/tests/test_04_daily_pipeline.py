import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock
from app.tasks.daily_pipeline import (
    run_discovery_stage,
    run_qualification_stage,
    run_personalization_stage,
    run_outreach_stage,
    poll_replies,
    generate_daily_report
)

from contextlib import asynccontextmanager

@pytest.fixture(autouse=True)
def mock_job_manager():
    @asynccontextmanager
    async def dummy_lock(*args, **kwargs):
        yield

    async def _always_active(*args, **kwargs):
        return True

    with patch("app.tasks.daily_pipeline.job_manager.is_job_active", return_value=True), \
         patch("app.tasks.daily_pipeline.job_manager.is_freelancer_pipeline_active", new=_always_active), \
         patch("app.tasks.daily_pipeline.advisory_lock", new=dummy_lock):
        yield

@pytest.mark.asyncio
async def test_run_discovery_stage(db_session):
    # Mock GooglePlaces and Groq Client to skip network requests
    with patch("app.tasks.daily_pipeline.GooglePlacesClient") as mock_google, \
         patch("app.tasks.daily_pipeline.GroqClient") as mock_groq, \
         patch("app.tasks.daily_pipeline.send_telegram_alert") as mock_telegram:
        
        async def mock_generate_targets(*args, **kwargs):
            return [{"city": "TestCity", "category": "TestCategory"}]
            
        async def mock_search_places(*args, **kwargs):
            return []
        
        mock_groq_instance = mock_groq.return_value
        mock_groq_instance.generate_daily_targets.side_effect = mock_generate_targets
        
        mock_google_instance = mock_google.return_value
        # Fix: Using search_places_paginated as it's now used in the international discovery
        mock_google_instance.search_places_paginated.side_effect = mock_search_places
        
        await run_discovery_stage()
        
        assert mock_groq_instance.generate_daily_targets.called
        assert mock_google_instance.search_places_paginated.called

@pytest.mark.asyncio
async def test_run_qualification_stage(db_session):
    with patch("app.tasks.daily_pipeline.qualify_lead") as mock_qualify:
        await run_qualification_stage()
        # Mock might not be called if DB is empty, but function shouldn't crash
        pass

@pytest.mark.asyncio
async def test_run_personalization_stage(db_session):
    with patch("app.tasks.daily_pipeline.GroqClient") as mock_groq:
        await run_personalization_stage()
        # Same as above - just ensuring no syntax / import errors in execution context
        pass

@pytest.mark.asyncio
async def test_run_outreach_stage(db_session):
    with patch("app.tasks.daily_pipeline.send_email") as mock_send_email:
        await run_outreach_stage()
        pass

@pytest.mark.asyncio
async def test_run_reply_polling_task(db_session):
    with patch("app.tasks.daily_pipeline.fetch_recent_replies") as mock_fetch:
        mock_fetch.return_value = []
        await poll_replies()
        assert mock_fetch.called

@pytest.mark.asyncio
async def test_run_daily_report_task(db_session):
    with patch("app.tasks.daily_pipeline.generate_daily_report_excel") as mock_excel, \
         patch("app.tasks.daily_pipeline.send_daily_report_email") as mock_email:
        await generate_daily_report()
        pass
