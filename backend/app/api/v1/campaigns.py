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
from app.models.user import User
from app.schemas.campaign import CampaignResponse, CampaignDetailResponse, CampaignStatsResponse

router = APIRouter(prefix="/campaigns")

@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Retrieves outreach campaigns sorted by date (newest first).
    Scoped to the current user's campaigns (superusers see all).
    """
    stmt = select(Campaign).order_by(Campaign.campaign_date.desc())
    if not current_user.is_superuser:
        stmt = stmt.where(Campaign.user_id == current_user.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{campaign_id}", response_model=CampaignDetailResponse)
async def get_campaign(campaign_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Retrieves a specific campaign with eagerly loaded email outreach records.
    Scoped to the current user.
    """
    from sqlalchemy.orm import selectinload
    stmt = select(Campaign).options(selectinload(Campaign.outreach)).where(Campaign.id == campaign_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Campaign.user_id == current_user.id)
    result = await db.execute(stmt)
    campaign = result.scalars().first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign

@router.get("/{campaign_id}/stats", response_model=CampaignStatsResponse)
async def get_campaign_stats(campaign_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Computes real-time engagement statistics for a given campaign.
    Scoped to the current user.
    """
    stmt = select(Campaign).where(Campaign.id == campaign_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Campaign.user_id == current_user.id)
    result = await db.execute(stmt)
    campaign = result.scalars().first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    from app.models.lead import Lead
    from app.models.campaign import EmailOutreach
    from sqlalchemy import func, distinct

    # Discovered/qualified counts reflect the campaign_date window (all leads
    # for this user that entered those stages on that day). Restricting to
    # the owning user prevents leaking counts across freelancers.
    disc_query = select(func.count(Lead.id)).where(func.date(Lead.discovered_at) == campaign.campaign_date)
    qual_query = select(func.count(Lead.id)).where(func.date(Lead.qualified_at) == campaign.campaign_date)
    if not current_user.is_superuser:
        disc_query = disc_query.where(Lead.user_id == current_user.id)
        qual_query = qual_query.where(Lead.user_id == current_user.id)
    discovered = await db.scalar(disc_query)
    qualified = await db.scalar(qual_query)
    
    return {
        "total_discovered": discovered or 0,
        "total_qualified": qualified or 0,
        "emails_sent": campaign.emails_sent,
        "emails_opened": campaign.emails_opened,
        "links_clicked": campaign.links_clicked,
        "replies_received": campaign.replies_received
    }
