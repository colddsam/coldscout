import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.lead import Lead, SearchHistory

@pytest.mark.asyncio
async def test_create_target_location(db_session: AsyncSession):
    new_location = SearchHistory(
        city="Test City",
        category="Test Category"
    )
    db_session.add(new_location)
    await db_session.commit()
    await db_session.refresh(new_location)
    
    assert new_location.id is not None
    assert new_location.city == "Test City"

@pytest.mark.asyncio
async def test_create_lead(db_session: AsyncSession):
    # Setup Location
    new_location = SearchHistory(
        city="Lead City",
        category="Test Category"
    )
    db_session.add(new_location)
    await db_session.commit()
    
    new_lead = Lead(
        business_name="Test Business",
        website_url="https://testbusiness.com",
        place_id="test_place_id",
        status="discovered"
    )
    db_session.add(new_lead)
    await db_session.commit()
    await db_session.refresh(new_lead)
    
    assert new_lead.id is not None
    assert new_lead.business_name == "Test Business"

@pytest.mark.asyncio
async def test_get_lead(db_session: AsyncSession):
    # Setup Location
    new_location = SearchHistory(
        city="Get City",
        category="Test Category"
    )
    db_session.add(new_location)
    await db_session.commit()
    
    new_lead = Lead(
        business_name="Test Business",
        website_url="https://testbusiness.com",
        place_id="test_place_id",
        status="discovered"
    )
    db_session.add(new_lead)
    await db_session.commit()

    # Find the lead we just created contextually or via query
    stmt = select(Lead).where(Lead.business_name == "Test Business")
    result = await db_session.execute(stmt)
    lead = result.scalar_one_or_none()
    
    assert lead is not None
    assert lead.business_name == "Test Business"
