"""
Single-lead manual outreach runner.

This module provides ``run_single_lead_outreach``, the per-lead equivalent of
the daily ``personalization`` + ``outreach`` stages found in
``daily_pipeline.py``. The freelancer-facing "Send Now" button on the Leads
CRM enqueues this job onto the shared serial queue
(``app.core.job_queue``), so it can never run concurrently with the
multi-lead automated pipeline.

Behavior is intentionally a 1:1 mirror of the automated stages so that
manually triggered emails are byte-identical to the ones produced by the
nightly run:

* Same Groq email content generation
* Same proposal PDF + companion XLSX generation
* Same demo-website generation hook for no-website leads (gated by
  ``DEMO_GENERATION_ENABLED``)
* Same tracking-token signing and HTML rendering pipeline (which embeds the
  open-tracking pixel and click-tracking links — so opens / clicks are still
  attributed exactly the same way)
* Same per-freelancer profile signature
* Same follow-up scheduling on success
* Same Campaign / EmailOutreach bookkeeping for analytics

If anything along the way fails, the lead's status is preserved at
``qualified`` so it remains eligible for retry — either via the same button
or via the next nightly run.
"""
from __future__ import annotations

import asyncio
import os
from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from loguru import logger
from sqlalchemy import select

from app.config import get_settings
from app.core.database import get_session_maker
from app.core.job_manager import job_manager
from app.core.locks import advisory_lock
from app.core import manual_outreach_tracker
from app.models.campaign import Campaign, EmailOutreach
from app.models.lead import Lead
from app.modules.demo_builder.generator import generate_demo_for_lead
from app.modules.outreach.email_sender import send_email
from app.modules.outreach.followup_engine import schedule_followup
from app.modules.personalization.booking_utils import get_resolved_booking_url
from app.modules.personalization.email_generator import render_email_html
from app.modules.personalization.groq_client import GroqClient
from app.modules.personalization.pdf_generator import generate_proposal_pdf
from app.modules.personalization.proposal_xlsx_generator import generate_proposal_xlsx
from app.modules.personalization.signature_renderer import get_freelancer_signature_html
from app.tasks.daily_pipeline import _generate_tracking_token

settings = get_settings()


async def run_single_lead_outreach(
    *,
    manual: bool = True,
    user_id: Optional[int] = None,
    lead_id: str | UUID,
) -> None:
    """Run personalization + outreach for one lead.

    Designed to be invoked from the shared serial queue (via
    ``functools.partial(run_single_lead_outreach, lead_id=...)``). The
    queue worker passes ``manual=`` and ``user_id=`` itself; ``lead_id`` is
    pre-bound by the API endpoint.

    Args:
        manual: Always True in practice (the only caller is the button).
        user_id: Owning freelancer's id — also enforced by the API endpoint.
        lead_id: UUID (or string thereof) of the lead to send to.
    """
    lead_id_str = str(lead_id)
    logger.info(
        f"Single-lead outreach starting (user_id={user_id}, lead_id={lead_id_str})"
    )

    # Both gates must allow personalization AND outreach. We treat the run
    # as gated by the more restrictive of the two so a freelancer can't
    # bypass either HOLD via this surface.
    if not await job_manager.is_freelancer_pipeline_active(
        "personalization", user_id=user_id, is_manual=manual
    ):
        await manual_outreach_tracker.mark_failed(
            lead_id_str, "Personalization stage is on HOLD for this freelancer"
        )
        return

    if not await job_manager.is_freelancer_pipeline_active(
        "outreach", user_id=user_id, is_manual=manual
    ):
        await manual_outreach_tracker.mark_failed(
            lead_id_str, "Outreach stage is on HOLD for this freelancer"
        )
        return

    await manual_outreach_tracker.mark_running(lead_id_str)

    # Hold the same advisory lock the automated stages use, so we cannot
    # race against a concurrent nightly run for the same freelancer.
    async with advisory_lock(f"pipeline_personalization_{user_id}"):
        try:
            await _personalize_and_dispatch_one(lead_id_str, user_id)
            await manual_outreach_tracker.mark_completed(lead_id_str)
        except _SingleLeadAbort as abort:
            # User-meaningful failure (e.g. lead not eligible). Surface it
            # to the UI but don't log a stack trace.
            logger.warning(f"Single-lead outreach aborted: {abort}")
            await manual_outreach_tracker.mark_failed(lead_id_str, str(abort))
            raise
        except Exception as e:
            logger.exception(
                f"Single-lead outreach failed for lead {lead_id_str}"
            )
            await manual_outreach_tracker.mark_failed(
                lead_id_str, f"{type(e).__name__}: {str(e)[:200]}"
            )
            raise


# ── Internal ─────────────────────────────────────────────────────────────────


class _SingleLeadAbort(RuntimeError):
    """Raised when the lead is not eligible for manual outreach."""


async def _personalize_and_dispatch_one(lead_id_str: str, user_id: Optional[int]) -> None:
    """Mirror of the automated personalization + outreach stages, scoped to
    a single lead. All DB work happens inside one session so the row
    transitions atomically: ``qualified → queued_for_send → email_sent``."""
    groq_client = GroqClient()
    session_maker = get_session_maker()

    async with session_maker() as db:
        # ── 1. Reload lead ────────────────────────
        lead_query = select(Lead).where(Lead.id == lead_id_str)
        lead = (await db.execute(lead_query)).scalars().first()

        if lead is None:
            raise _SingleLeadAbort(f"Lead not found with ID: {lead_id_str}")

        from app.models.user import User
        from app.models.profile import UserProfile
        res = await db.execute(
            select(User.full_name, UserProfile.username)
            .outerjoin(UserProfile, User.id == UserProfile.user_id)
            .where(User.id == user_id)
        )
        row = res.first()
        from_name = None
        if row:
            full_name, username = row
            from_name = full_name or username
        
        if lead.status != "qualified":
            raise _SingleLeadAbort(
                f"Lead status is '{lead.status}'; only 'qualified' leads can be sent."
            )
        if not lead.email:
            raise _SingleLeadAbort("Lead has no email address.")

        # ── 2. Resolve campaign for today (per freelancer) ──────────────
        today = date.today()
        camp_query = select(Campaign).where(Campaign.campaign_date == today)
        if user_id is not None:
            camp_query = camp_query.where(Campaign.user_id == user_id)
        campaign = (await db.execute(camp_query.limit(1))).scalars().first()
        if not campaign:
            campaign = Campaign(
                name=f"Daily Outreach {today}",
                campaign_date=today,
                user_id=user_id,
            )
            db.add(campaign)
            await db.flush()

        resolved_booking_url = await get_resolved_booking_url(db, user_id)

        # ── 3. Optional website content + competitor enrichment ─────────
        website_content: dict = {}
        if lead.website_url and lead.has_website:
            from app.modules.enrichment.website_content_extractor import (
                extract_website_content,
            )
            website_content = await extract_website_content(lead.website_url)
            lead.website_title = website_content.get("page_title")
            lead.website_copyright_year = website_content.get("copyright_year")
            lead.is_mobile_responsive = website_content.get("is_mobile_responsive")
            lead.has_online_booking = website_content.get("has_online_booking")
            lead.has_ecommerce = website_content.get("has_ecommerce")

        from app.modules.enrichment.competitor_finder import find_top_competitor
        competitor = await find_top_competitor(
            lead.category, lead.city, db,
            country_code=lead.country_code,
        )

        # ── 4. AI email content + proposal artifacts ────────────────────
        ai_data = await groq_client.generate_email_content({
            "business_name":     lead.business_name,
            "category":          lead.category,
            "location":          lead.city,
            "city":              lead.city,
            "region":            lead.region,
            "country":           lead.country,
            "sub_area":          lead.sub_area,
            "rating":            lead.rating,
            "review_count":      lead.review_count,
            "qualification_notes": lead.qualification_notes,
            "website_title":     website_content.get("page_title"),
            "website_services":  website_content.get("services_mentioned", []),
            "website_year":      website_content.get("copyright_year"),
            "is_mobile":         website_content.get("is_mobile_responsive", True),
            "competitor_name":   competitor["name"] if competitor else None,
        })

        pdf_path = generate_proposal_pdf(
            business_name=lead.business_name,
            category=lead.category,
            benefits=ai_data.get("benefits", []),
            output_filename=f"Proposal_{lead.id}.pdf",
            rating=lead.rating,
            review_count=lead.review_count,
            city=lead.city,
            qualification_notes=lead.qualification_notes,
        )
        xlsx_path = generate_proposal_xlsx(
            business_name=lead.business_name,
            category=lead.category,
            benefits=ai_data.get("benefits", []),
            output_filename=f"Proposal_{lead.id}.xlsx",
            rating=lead.rating,
            review_count=lead.review_count,
            city=lead.city,
        )

        # Demo site (best-effort, fully isolated from the email path)
        if not lead.has_website and settings.DEMO_GENERATION_ENABLED:
            try:
                await generate_demo_for_lead(lead)
            except Exception as demo_err:
                logger.warning(
                    f"Demo generation failed for lead {lead.id} during "
                    f"manual run, continuing without demo link: {demo_err}"
                )

        # ── 5. Render the email body ────────────────────────────────────
        attachments = [p for p in [pdf_path, xlsx_path] if p]
        tracking_token = _generate_tracking_token(lead.id, campaign.id)

        demo_url = None
        if (
            not lead.has_website
            and lead.demo_site_status == "generated"
            and lead.generated_demo_html
        ):
            demo_url = f"{settings.FRONTEND_DOMAIN}/demo/{lead.id}"

        profile_signature_html = await get_freelancer_signature_html(lead.user_id, db)

        html_body = render_email_html(
            {"business_name": lead.business_name},
            ai_data.get("body_html", ""),
            tracking_token,
            settings.APP_URL,
            demo_url=demo_url,
            booking_url=resolved_booking_url,
            profile_signature_html=profile_signature_html,
        )

        # ── 6. Create the EmailOutreach row, mirror automated bookkeeping ─
        outreach = EmailOutreach(
            lead_id          = lead.id,
            campaign_id      = campaign.id,
            to_email         = lead.email,
            subject          = ai_data.get(
                "subject", f"Digital Growth for {lead.business_name}"
            ),
            body_html        = html_body,
            tracking_token   = tracking_token,
            ai_generated     = True,
            has_attachment   = bool(attachments),
            attachment_names = attachments,
            status           = "queued",
        )
        db.add(outreach)
        campaign.total_leads += 1
        lead.status = "queued_for_send"
        await db.commit()

        # ── 7. SMTP dispatch + status finalization ──────────────────────
        try:
            await send_email(
                to_email     = outreach.to_email,
                subject      = outreach.subject,
                html_content = outreach.body_html,
                attachment_paths = attachments,
                from_name    = from_name,
            )
            outreach.status = "sent"
            outreach.sent_at = datetime.now(timezone.utc)

            lead.status = "email_sent"
            lead.email_sent_at = datetime.now(timezone.utc)

            await schedule_followup(lead, db)

            campaign.emails_sent += 1
            if campaign.status == "pending":
                campaign.status = "active"
                campaign.started_at = datetime.now(timezone.utc)

            await db.commit()
        except Exception as send_err:
            # SMTP failed after the personalization commit had already
            # moved the lead to ``queued_for_send``. Roll the status back
            # to ``qualified`` so the user can retry the send straight
            # from the button without first having to press Unlock.
            #
            # Reset follow-up bookkeeping too: ``schedule_followup`` may
            # have run before the failing line and left
            # ``next_followup_at`` / ``followup_sequence_active`` set —
            # leaving those in place would queue a follow-up for an
            # email that never went out.
            outreach.status = "failed"
            lead.status = "qualified"
            lead.email_sent_at = None
            lead.followup_sequence_active = False
            lead.next_followup_at = None
            lead.follow_up_stage = 0
            lead.followup_count = 0
            try:
                await db.commit()
            except Exception:
                await db.rollback()
            raise send_err
        finally:
            # Always clean up tmp proposal files; mirrors automated outreach.
            for att in attachments or []:
                if att and os.path.exists(att):
                    try:
                        os.remove(att)
                    except Exception as cleanup_e:
                        logger.warning(
                            f"Failed to clean up attachment {att}: {cleanup_e}"
                        )

        # Modest delay to mirror the automated outreach throttling so a
        # burst of single-lead clicks doesn't trip spam filters.
        await asyncio.sleep(1)
