"""
AI Lead Generation System - Campaign Engagement API

This module provides high-level visibility into outreach performance. It enables
administrators to track campaign success rates by aggregating engagement signals 
(opens, clicks, replies) at both the campaign and individualized lead level.

Functionality:
- Campaign Indexing: List all scheduled and completed outreach efforts.
- Deep Dive Views: Retrieve detailed outreach payloads for a specific campaign.
- Real-time Analytics: Derive funnel conversion metrics (Discovered → Qualified → Engaged).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.campaign import Campaign
from app.schemas.campaign import CampaignResponse, CampaignDetailResponse, CampaignStatsResponse

router = APIRouter(prefix="/campaigns", dependencies=[Depends(get_current_user)])

@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    """
    Retrieves all outreach campaigns sorted by date (newest first).

    Returns:
        List[CampaignResponse]: Campaign summary records including aggregate email metrics.
    """
    stmt = select(Campaign).order_by(Campaign.campaign_date.desc())
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{campaign_id}", response_model=CampaignDetailResponse)
async def get_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieves a specific campaign with eagerly loaded email outreach records.

    Args:
        campaign_id: UUID string identifying the target campaign.

    Returns:
        CampaignDetailResponse: Full campaign entity including nested outreach dispatches.

    Raises:
        HTTPException 404: If no campaign matches the provided identifier.
    """
    from sqlalchemy.orm import selectinload
    stmt = select(Campaign).options(selectinload(Campaign.outreach)).where(Campaign.id == campaign_id)
    result = await db.execute(stmt)
    campaign = result.scalars().first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign

@router.get("/{campaign_id}/stats", response_model=CampaignStatsResponse)
async def get_campaign_stats(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """
    Computes real-time engagement statistics for a given campaign.

    Cross-references the campaign date against lead discovery and qualification
    timestamps to derive funnel metrics (discovered → qualified → sent → opened → clicked → replied).

    Args:
        campaign_id: UUID string identifying the target campaign.

    Returns:
        CampaignStatsResponse: Aggregated funnel metrics for the campaign.

    Raises:
        HTTPException 404: If no campaign matches the provided identifier.
    """
    stmt = select(Campaign).where(Campaign.id == campaign_id)
    result = await db.execute(stmt)
    campaign = result.scalars().first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    from app.models.lead import Lead
    from sqlalchemy import func
    
    discovered = await db.scalar(select(func.count(Lead.id)).where(func.date(Lead.discovered_at) == campaign.campaign_date))
    qualified = await db.scalar(select(func.count(Lead.id)).where(func.date(Lead.qualified_at) == campaign.campaign_date))
    
    return {
        "total_discovered": discovered or 0,
        "total_qualified": qualified or 0,
        "emails_sent": campaign.emails_sent,
        "emails_opened": campaign.emails_opened,
        "links_clicked": campaign.links_clicked,
        "replies_received": campaign.replies_received
    }
