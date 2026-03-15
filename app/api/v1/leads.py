"""
Lead management API endpoints.
Provides CRUD operations, filtered listing, and CSV export capabilities
for the discovered local business leads lifecycle.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.main import get_api_key
from app.core.database import get_db
from app.models.lead import Lead
from app.schemas.lead import LeadResponse, LeadDetailResponse, LeadUpdate, LeadListResponse
from fastapi.responses import StreamingResponse
import csv
import io
from datetime import date

router = APIRouter(prefix="/leads", dependencies=[Depends(get_api_key)])

@router.get("", response_model=LeadListResponse)
async def list_leads(
    status: Optional[str] = None,
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

    Supports filtering by lifecycle status, geographic city, business category,
    and discovery date range. Results are ordered by creation date (newest first).

    Args:
        status: Filter by lead lifecycle status (e.g. 'qualified', 'email_sent').
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
    if city:
        stmt = stmt.where(Lead.city.ilike(f"%{city}%"))
    if category:
        stmt = stmt.where(Lead.category.ilike(f"%{category}%"))
    if date_from:
        stmt = stmt.where(func.date(Lead.created_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Lead.created_at) <= date_to)
        
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
    city: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Exports the filtered lead set as a downloadable CSV attachment.

    Applies the same filter criteria as the list endpoint. The response streams
    an RFC-4180-compliant CSV file with columns: ID, Business Name, Email,
    Phone, City, Category, Status, and Created At.

    Returns:
        StreamingResponse: A `text/csv` attachment named `leads_YYYY-MM-DD.csv`.
    """
    stmt = select(Lead)
    if status:
        stmt = stmt.where(Lead.status == status)
    if city:
        stmt = stmt.where(Lead.city.ilike(f"%{city}%"))
    if category:
        stmt = stmt.where(Lead.category.ilike(f"%{category}%"))
    if date_from:
        stmt = stmt.where(func.date(Lead.created_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(Lead.created_at) <= date_to)
        
    result = await db.execute(stmt)
    leads = result.scalars().all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Business Name", "Email", "Phone", "City", "Category", "Status", "Created At"])
    for lead in leads:
        writer.writerow([
            str(lead.id), lead.business_name, lead.email or "", lead.phone or "", 
            lead.city or "", lead.category or "", lead.status, str(lead.created_at)
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]), 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename=leads_{date.today()}.csv"}
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
