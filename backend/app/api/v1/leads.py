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
from functools import partial

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core import manual_outreach_tracker
from app.core.plan_gate import is_paid_plan_active
from app.core.job_queue import (
    enqueue as enqueue_queue,
    queue_size,
    register_stage,
)
from app.core.pipeline_tracker import enqueue_job
from app.config import get_settings
from app.models.lead import Lead
from app.models.user import User
from app.schemas.lead import (
    LeadResponse,
    LeadUpdate,
    LeadDetailResponse,
    LeadListResponse
)
from app.tasks.single_lead_pipeline import run_single_lead_outreach
from app.tasks.single_lead_whatsapp import (
    WhatsAppOutreachError,
    build_whatsapp_outreach,
    invalidate_cache as invalidate_whatsapp_cache,
)

router = APIRouter(prefix="/leads")

# Register the per-lead runner with the shared serial queue. Marked
# freelancer-aware so the queue worker forwards ``manual=`` and ``user_id=``
# kwargs (the ``lead_id`` is pre-bound via functools.partial when the API
# endpoint enqueues a job).
_SINGLE_LEAD_STAGE = "single_lead_outreach"
register_stage(_SINGLE_LEAD_STAGE, run_single_lead_outreach, freelancer_aware=True)

settings = get_settings()

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
    if update_data.is_private_override is not None:
        lead.is_private_override = update_data.is_private_override
        # If user explicitly opts out, instantly remove from public directory
        if update_data.is_private_override:
            lead.is_public = False
        
    await db.commit()
    await db.refresh(lead)
    return lead

# ── Manual single-lead outreach ──────────────────────────────────────────────


_RUN_OUTREACH_TERMINAL_STATUSES = {
    # Statuses that indicate the lead has already been (or is being) handled
    # by a personalization+outreach run. The button is disabled in these
    # states and the user must press Unlock to retry.
    "queued_for_send",
    "email_sent",
    "opened",
    "clicked",
    "replied",
    "bounced",
    "unsubscribed",
    "rejected",
}


def _build_outreach_state_payload(lead: Lead, manual_state: Optional[dict], q_size: int) -> dict:
    """Compose the response payload for the outreach-state endpoint.

    ``button_state`` is the single value the UI uses to decide which control
    to render:

    * ``eligible``     — qualified email lead, ready to send.
    * ``in_flight``    — manual job is queued or running for this lead.
    * ``locked``       — lead has progressed past qualified; needs Unlock.
    * ``failed``       — last manual run failed; user can retry directly.
    * ``phone_only``   — phone_qualified lead → render WhatsApp link instead.
    * ``not_eligible`` — any other state (e.g. discovered, qualification_error).
    """
    status = lead.status or ""
    manual_status = (manual_state or {}).get("status")

    if status == "phone_qualified":
        button_state = "phone_only"
    elif manual_status in ("queued", "running"):
        button_state = "in_flight"
    elif status in _RUN_OUTREACH_TERMINAL_STATUSES:
        # A terminal lead status outranks a stale ``manual_status='failed'``
        # entry. Otherwise a failed manual run followed by a successful
        # daily-pipeline send would still surface "Retry Send" — clicking
        # it would 409 because the lead is no longer ``qualified``.
        button_state = "locked"
    elif manual_status == "failed" and status == "qualified" and lead.email:
        button_state = "failed"
    elif status == "qualified" and lead.email:
        button_state = "eligible"
    else:
        button_state = "not_eligible"

    return {
        "lead_id": str(lead.id),
        "lead_status": status,
        "button_state": button_state,
        "manual_status": manual_status,
        "manual_error": (manual_state or {}).get("error"),
        "queued_at": (manual_state or {}).get("queued_at"),
        "started_at": (manual_state or {}).get("started_at"),
        "ended_at": (manual_state or {}).get("ended_at"),
        # qsize counts jobs currently waiting in the queue (excluding the
        # one a worker is executing). Surfaced as a coarse "X jobs ahead"
        # hint while the lead's manual job is in flight; ``None`` once the
        # job is actually running so the chip can flip from "Queued…" to
        # "Sending…" without the misleading number trailing along.
        "queue_position": q_size if (
            button_state == "in_flight"
            and manual_status == "queued"
            and q_size > 0
        ) else None,
        "has_email": bool(lead.email),
        "has_phone": bool(lead.phone),
    }


async def _load_owned_lead(db: AsyncSession, lead_id: str, user: User) -> Lead:
    stmt = select(Lead).where(Lead.id == lead_id)
    if not user.is_superuser:
        stmt = stmt.where(Lead.user_id == user.id)
    res = await db.execute(stmt)
    lead = res.scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.get("/{lead_id}/outreach-state")
async def get_outreach_state(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the per-lead outreach button state used by the Leads CRM."""
    lead = await _load_owned_lead(db, lead_id, current_user)
    manual_state = await manual_outreach_tracker.get_state(str(lead.id))
    q_size = await queue_size()
    return _build_outreach_state_payload(lead, manual_state, q_size)


@router.post("/{lead_id}/trigger-outreach")
async def trigger_outreach(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enqueues a single-lead personalization + outreach job.

    The job runs on the same shared serial queue used by the manual stage
    triggers, so it executes one-at-a-time alongside any other queued work
    (this is the requested "queued behind active jobs" behavior).
    """
    lead = await _load_owned_lead(db, lead_id, current_user)

    # Plan gate — single-lead "Send Now" generates a proposal, runs Groq
    # for email content, optionally builds a demo site, then sends via
    # SMTP. All of that is paid-only. Surface 402 at the API edge so the
    # SPA shows the upgrade dialog instead of a confusing
    # "queued… failed" cycle in the per-lead button state.
    if not is_paid_plan_active(current_user):
        raise HTTPException(
            status_code=402,
            detail=(
                "Sending outreach for a lead requires a Pro or Enterprise plan. "
                "Upgrade to start sending personalized outreach."
            ),
        )

    if lead.status != "qualified":
        raise HTTPException(
            status_code=409,
            detail=(
                "Lead is no longer in 'qualified' state — press Unlock to "
                "reset before triggering outreach again."
            ),
        )
    if not lead.email:
        raise HTTPException(status_code=409, detail="Lead has no email address.")

    # Manual outreach is driven by the logged-in freelancer. We use current_user.id
    # instead of lead.user_id to ensure the identity resolution (name, signature,
    # and booking link) matches the person actually sending the mail.
    owner_user_id = current_user.id

    # Atomic claim — closes the TOCTOU window between two simultaneous
    # double-clicks. ``mark_queued`` returns False if another request has
    # already grabbed the slot.
    claimed = await manual_outreach_tracker.mark_queued(str(lead.id), current_user.id)
    if not claimed:
        raise HTTPException(
            status_code=409,
            detail="A manual outreach job is already queued or running for this lead.",
        )

    await enqueue_job(
        owner_user_id, _SINGLE_LEAD_STAGE, triggered_by=f"manual:lead:{lead.id}"
    )

    bound_runner = partial(run_single_lead_outreach, lead_id=str(lead.id))
    await enqueue_queue(_SINGLE_LEAD_STAGE, bound_runner, True, owner_user_id)

    manual_state = await manual_outreach_tracker.get_state(str(lead.id))
    q_size = await queue_size()
    return _build_outreach_state_payload(lead, manual_state, q_size)


@router.post("/{lead_id}/unlock-outreach")
async def unlock_outreach(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resets a lead so its outreach button can be triggered again.

    Restores ``status='qualified'``, clears the manual-outreach tracker
    entry, and deactivates any queued follow-up so the new send doesn't
    collide with the old sequence. The lead's prior EmailOutreach rows are
    preserved so analytics history stays intact.

    Cannot be applied while a manual job is in flight — the user must wait
    for the queue to drain before unlocking.
    """
    lead = await _load_owned_lead(db, lead_id, current_user)

    if await manual_outreach_tracker.is_in_flight(str(lead.id)):
        raise HTTPException(
            status_code=409,
            detail="Cannot unlock while a manual outreach job is in flight. "
                   "Wait for it to finish first.",
        )

    if not lead.email:
        raise HTTPException(
            status_code=409,
            detail="Lead has no email address — outreach button is not applicable.",
        )

    lead.status = "qualified"
    lead.email_sent_at = None
    lead.followup_sequence_active = False
    lead.next_followup_at = None
    lead.follow_up_stage = 0
    lead.followup_count = 0
    await db.commit()

    await manual_outreach_tracker.clear(str(lead.id))

    manual_state = await manual_outreach_tracker.get_state(str(lead.id))
    q_size = await queue_size()
    return _build_outreach_state_payload(lead, manual_state, q_size)


@router.post("/{lead_id}/whatsapp-link")
async def post_whatsapp_link(
    lead_id: str,
    regenerate: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run personalization for a phone-qualified lead and return a wa.me deep link.

    Behaviour:
    - First click → runs the same enrichment + Groq personalization the email
      flow uses, generates a short conversational WhatsApp body, normalizes the
      phone number using the lead's ``country_code`` so the wa.me URL is valid
      regardless of how the number is stored, and caches the message in Redis
      for 24h.
    - Subsequent clicks within 24h → return the cached body (no Groq cost).
    - Pass ``regenerate=true`` to force a fresh Groq call (bypass the cache).

    The lead's status is intentionally NOT changed — WhatsApp delivery is
    user-driven (the freelancer presses Send inside WhatsApp), and we have no
    automated way to confirm it.
    """
    lead = await _load_owned_lead(db, lead_id, current_user)

    # Plan gate — WhatsApp builder runs Groq (paid AI call) and may
    # trigger a demo-site generation. Block free users here for the same
    # reason as the email Send Now: it bills the platform for work that
    # the tier doesn't entitle the user to.
    if not is_paid_plan_active(current_user):
        raise HTTPException(
            status_code=402,
            detail=(
                "Personalized WhatsApp outreach requires a Pro or Enterprise "
                "plan. Upgrade to unlock AI-generated messages and the wa.me "
                "deep link."
            ),
        )

    if not lead.phone:
        raise HTTPException(status_code=409, detail="Lead has no phone number on file.")

    sender_name = current_user.full_name or current_user.email or None
    owner_user_id = current_user.id

    try:
        result = await build_whatsapp_outreach(
            lead_id=str(lead.id),
            user_id=owner_user_id,
            sender_name=sender_name,
            force_regenerate=bool(regenerate),
        )
    except WhatsAppOutreachError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {
        "lead_id": str(lead.id),
        **result,
    }


@router.post("/{lead_id}/whatsapp-link/invalidate")
async def invalidate_whatsapp_message(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Drop the cached WhatsApp message so the next click regenerates it.

    Useful after the freelancer updates their profile / signature and wants
    the next outreach to reflect the change.
    """
    lead = await _load_owned_lead(db, lead_id, current_user)
    await invalidate_whatsapp_cache(str(lead.id))
    return {"lead_id": str(lead.id), "invalidated": True}


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
    # Plan gate — demo regeneration calls Groq and writes a new HTML
    # artifact. Same paid-only contract as Send Now / WhatsApp; 402 at
    # the API edge keeps free users from kicking unbounded AI work via
    # a fire-and-forget background task.
    if not is_paid_plan_active(current_user):
        raise HTTPException(
            status_code=402,
            detail=(
                "Regenerating a demo site requires a Pro or Enterprise plan. "
                "Upgrade to rebuild AI-generated demo previews."
            ),
        )

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
