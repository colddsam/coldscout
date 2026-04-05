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
from app.schemas.lead import (
    LeadResponse, 
    LeadUpdate, 
    LeadDetailResponse, 
    LeadListResponse
)

router = APIRouter(prefix="/leads", dependencies=[Depends(get_current_user)])

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
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieves a paginated, optionally filtered list of discovered leads.

    Supports filtering by lifecycle status, country, region, city, business category,
    and discovery date range. Results are ordered by creation date (newest first).

    Args:
        status: Filter by lead lifecycle status (e.g. 'qualified', 'email_sent').
        country: Case-insensitive partial match on the lead's country name.
        country_code: Exact match on ISO 3166-1 alpha-2 code (e.g. 'US', 'IN').
        region: Case-insensitive partial match on the lead's region/state.
        city: Case-insensitive partial match on the lead's city.
        category: Case-insensitive partial match on the business category.
        date_from: ISO date string — only return leads created on or after this date.
        date_to: ISO date string — only return leads created on or before this date.
        page: 1-indexed page number for pagination (default: 1).
        limit: Maximum leads per page, capped at 100 (default: 50).

    Returns:
        LeadListResponse: Paginated response containing leads array, total count, and page metadata.
    """
    stmt = select(Lead)
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
    db: AsyncSession = Depends(get_db)
):
    """
    Exports the filtered lead set as a downloadable CSV attachment.

    Applies the same filter criteria as the list endpoint. The response streams
    an RFC-4180-compliant CSV file with columns including international location
    fields: Country, Country Code, Region, Sub-Area, and Postal Code.

    Row Limit:
        A hard cap of 10,000 rows is enforced to protect the database from
        unbounded full-table scans triggered by a single HTTP request. When
        the result set is truncated, an ``X-Export-Truncated: true`` response
        header is included so the client can surface a warning to the user.

    Returns:
        StreamingResponse: A `text/csv` attachment named `leads_YYYY-MM-DD.csv`.
    """
    CSV_EXPORT_LIMIT = 10_000

    stmt = select(Lead)
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
async def get_lead(lead_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieves the full profile for a single lead, including eagerly loaded social network associations.

    Args:
        lead_id: UUID string identifying the target lead.

    Returns:
        LeadDetailResponse: Complete lead entity with enrichment data, lifecycle timestamps,
        follow-up metadata, reply intelligence, and social network records.

    Raises:
        HTTPException 404: If no lead matches the provided identifier.
    """
    from sqlalchemy.orm import selectinload
    stmt = select(Lead).options(selectinload(Lead.social_networks)).where(Lead.id == lead_id)
    result = await db.execute(stmt)
    lead = result.scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(lead_id: str, update_data: LeadUpdate, db: AsyncSession = Depends(get_db)):
    """
    Partially updates a lead's mutable attributes (status and/or notes).

    This endpoint is used by administrators to manually override lifecycle statuses
    or annotate leads with contextual remarks.

    Args:
        lead_id: UUID string identifying the target lead.
        update_data: Partial update payload containing optional `status` and `notes` fields.

    Returns:
        LeadResponse: The refreshed lead entity reflecting the applied mutations.

    Raises:
        HTTPException 404: If no lead matches the provided identifier.
    """
    stmt = select(Lead).where(Lead.id == lead_id)
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

@router.delete("/{lead_id}", status_code=204)
async def delete_lead(lead_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently deletes a lead and all associated records from the system.
    
    This includes social networks, outreach history, and event tracking.
    Use with caution as this action cannot be undone.

    Args:
        lead_id: UUID string identifying the target lead.

    Raises:
        HTTPException 404: If no lead matches the provided identifier.
    """
    stmt = select(Lead).where(Lead.id == lead_id)
    result = await db.execute(stmt)
    lead = result.scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    await db.delete(lead)
    await db.commit()
    return None
