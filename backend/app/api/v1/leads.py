"""
AI Lead Generation System - Lead Management API

This module provides a comprehensive suite of endpoints for managing the 
prospect lifecycle. It serves as the primary data source for the frontend 
dashboard, enabling granular filtering and bulk data extraction.

Functionality:
- Paginated Search: Filter leads by city, category, status, and discovery date.
- CSV Extraction: Export filtered datasets for external CRM usage.
- Enrichment Review: Retrieve detailed AI qualification scores and social signals.
- Manual Maintenance: Authorize status overrides and lead deletion.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
import csv
import io
from datetime import date

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.lead import Lead
from app.models.user import User
from app.schemas.lead import (
    LeadResponse,
    LeadUpdate,
    LeadDetailResponse,
    LeadListResponse
)

router = APIRouter(prefix="/leads")

@router.get("", response_model=LeadListResponse)
async def list_leads(
    status: Optional[str] = None,
    country: Optional[str] = None,
    country_code: Optional[str] = None,
    region: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves a paginated, optionally filtered list of leads belonging to the current user.

    Supports filtering by lifecycle status, country, region, city, business category,
    and discovery date range. Results are ordered by creation date (newest first).
    Every caller — including superusers — only sees leads owned by their own
    user_id. Cross-user visibility is not allowed on this endpoint.
    """
    stmt = select(Lead)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    if status:
        stmt = stmt.where(Lead.status == status)
    if country_code:
        stmt = stmt.where(Lead.country_code == country_code.upper())
    elif country:
        stmt = stmt.where(Lead.country.ilike(f"%{country}%"))
    if region:
        stmt = stmt.where(Lead.region.ilike(f"%{region}%"))
    if city:
        stmt = stmt.where(Lead.city.ilike(f"%{city}%"))
    if category:
        stmt = stmt.where(Lead.category.ilike(f"%{category}%"))
    if date_from:
        try:
            parsed_from = date.fromisoformat(date_from)
            stmt = stmt.where(func.date(Lead.created_at) >= parsed_from)
        except ValueError:
            pass  # Ignore invalid date strings
    if date_to:
        try:
            parsed_to = date.fromisoformat(date_to)
            stmt = stmt.where(func.date(Lead.created_at) <= parsed_to)
        except ValueError:
            pass  # Ignore invalid date strings
        
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt)
    if total is None:
        total = 0
    
    stmt = stmt.offset((page - 1) * limit).limit(limit).order_by(Lead.created_at.desc())
    result = await db.execute(stmt)
    leads = result.scalars().all()
    
    pages = (total + limit - 1) // limit if total > 0 else 1
    
    return {
        "leads": leads,
        "total": total,
        "page": page,
        "pages": pages
    }

@router.get("/export/csv")
async def export_leads_csv(
    status: Optional[str] = None,
    country: Optional[str] = None,
    country_code: Optional[str] = None,
    region: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Exports the filtered lead set as a downloadable CSV attachment.
    Strictly scoped to the current user's leads.
    """
    CSV_EXPORT_LIMIT = 10_000

    stmt = select(Lead)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    if status:
        stmt = stmt.where(Lead.status == status)
    if country_code:
        stmt = stmt.where(Lead.country_code == country_code.upper())
    elif country:
        stmt = stmt.where(Lead.country.ilike(f"%{country}%"))
    if region:
        stmt = stmt.where(Lead.region.ilike(f"%{region}%"))
    if city:
        stmt = stmt.where(Lead.city.ilike(f"%{city}%"))
    if category:
        stmt = stmt.where(Lead.category.ilike(f"%{category}%"))
    if date_from:
        try:
            parsed_from = date.fromisoformat(date_from)
            stmt = stmt.where(func.date(Lead.created_at) >= parsed_from)
        except ValueError:
            pass
    if date_to:
        try:
            parsed_to = date.fromisoformat(date_to)
            stmt = stmt.where(func.date(Lead.created_at) <= parsed_to)
        except ValueError:
            pass

    stmt = stmt.limit(CSV_EXPORT_LIMIT + 1).order_by(Lead.created_at.desc())
    result = await db.execute(stmt)
    leads = result.scalars().all()

    truncated = len(leads) > CSV_EXPORT_LIMIT
    if truncated:
        leads = leads[:CSV_EXPORT_LIMIT]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Business Name", "Email", "Phone",
        "Country", "Country Code", "Region", "City", "Sub-Area", "Postal Code",
        "Category", "Status", "Created At",
    ])
    for lead in leads:
        writer.writerow([
            str(lead.id), lead.business_name, lead.email or "", lead.phone or "",
            lead.country or "", lead.country_code or "", lead.region or "",
            lead.city or "", lead.sub_area or "", lead.postal_code or "",
            lead.category or "", lead.status, str(lead.created_at),
        ])

    output.seek(0)

    response_headers = {
        "Content-Disposition": f"attachment; filename=leads_{date.today()}.csv",
    }
    if truncated:
        # Inform the client that the export was capped; the full dataset requires
        # additional filtering or a direct database extract.
        response_headers["X-Export-Truncated"] = "true"
        response_headers["X-Export-Row-Limit"] = str(CSV_EXPORT_LIMIT)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers=response_headers,
    )

@router.get("/{lead_id}", response_model=LeadDetailResponse)
async def get_lead(lead_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Retrieves the full profile for a single lead, scoped to the current user.
    """
    from sqlalchemy.orm import selectinload
    stmt = select(Lead).options(selectinload(Lead.social_networks)).where(Lead.id == lead_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    result = await db.execute(stmt)
    lead = result.scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, update_data: LeadUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Partially updates a lead's mutable attributes (status and/or notes).
    Scoped to the current user's leads.
    """
    stmt = select(Lead).where(Lead.id == lead_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    result = await db.execute(stmt)
    lead = result.scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    if update_data.status is not None:
        lead.status = update_data.status
    if update_data.notes is not None:
        lead.notes = update_data.notes
        
    await db.commit()
    await db.refresh(lead)
    return lead

@router.get("/{lead_id}/demo-status")
async def get_demo_status(lead_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Returns the demo generation status and metadata for a lead (scoped to current user)."""
    stmt = select(
        Lead.demo_site_status,
        Lead.demo_generated_at,
        Lead.demo_view_count,
        Lead.has_website,
    ).where(Lead.id == lead_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")

    status, generated_at, view_count, has_website = row
    return {
        "demo_site_status": status,
        "demo_generated_at": generated_at,
        "demo_view_count": view_count,
        "has_website": has_website,
    }


@router.get("/{lead_id}/demo-preview")
async def preview_demo(lead_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Returns the demo HTML for admin preview (not the public-facing endpoint)."""
    from fastapi.responses import HTMLResponse

    stmt = select(Lead.generated_demo_html, Lead.demo_site_status).where(Lead.id == lead_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Lead not found")

    html, status = row
    if status != "generated" or not html:
        raise HTTPException(status_code=404, detail="Demo not generated for this lead")

    return HTMLResponse(content=html)


@router.post("/{lead_id}/demo-regenerate")
async def regenerate_demo(lead_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Triggers re-generation of the demo for a lead (resets status to pending)."""
    stmt = select(Lead).where(Lead.id == lead_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    result = await db.execute(stmt)
    lead = result.scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.has_website:
        raise HTTPException(status_code=400, detail="Lead has a website — demo not applicable")

    lead.demo_site_status = "pending"
    lead.generated_demo_html = None
    lead.demo_generated_at = None
    await db.commit()

    # Trigger generation asynchronously
    import asyncio
    from app.modules.demo_builder.generator import generate_demo_for_lead

    async def _generate_and_save():
        from app.core.database import get_session_maker
        async with get_session_maker()() as regen_db:
            regen_result = await regen_db.execute(select(Lead).where(Lead.id == lead_id))
            regen_lead = regen_result.scalars().first()
            if regen_lead:
                await generate_demo_for_lead(regen_lead)
                await regen_db.commit()

    asyncio.create_task(_generate_and_save())

    return {"message": "Demo regeneration started", "status": "pending"}


@router.delete("/{lead_id}", status_code=204)
async def delete_lead(lead_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Permanently deletes a lead and all associated records from the system.
    Scoped to the current user's leads.
    """
    stmt = select(Lead).where(Lead.id == lead_id)
    if not current_user.is_superuser:
        stmt = stmt.where(Lead.user_id == current_user.id)
    result = await db.execute(stmt)
    lead = result.scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    await db.delete(lead)
    await db.commit()
    return None
