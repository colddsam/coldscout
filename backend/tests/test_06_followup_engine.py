import pytest
from unittest.mock import patch, MagicMock
from app.models.lead import Lead

@pytest.mark.asyncio
async def test_followup_scheduling(db_session):
    """Test that follow-up sequence is correctly scheduled on first email."""
    from app.modules.outreach.followup_engine import schedule_followup
    
    lead = Lead(
        place_id="test_place",
        business_name="Test Business",
        email="test@example.com"
    )
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)
    
    await schedule_followup(lead, db_session)
    
    assert lead.followup_sequence_active is True
    assert lead.next_followup_at is not None
    assert lead.followup_count == 0

@pytest.mark.asyncio
async def test_followup_cancellation(db_session):
    """Test that sequence is cancelled properly."""
    from app.modules.outreach.followup_engine import cancel_followup_sequence
    
    lead = Lead(
        place_id="test_place_2",
        business_name="Test Business 2",
        email="test2@example.com",
        followup_sequence_active=True
    )
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)
    
    await cancel_followup_sequence(lead.id, db_session)
    
    # Reload from db
    await db_session.refresh(lead)
    assert lead.followup_sequence_active is False
