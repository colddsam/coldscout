"""
Daily lead generation pipeline execution module.
Orchestrates discovery, qualification, personalization, outreach, and reporting workflows.
"""
import asyncio
import base64
import os
from datetime import date, datetime, timedelta, timezone
from loguru import logger
from app.core.job_manager import job_manager
from app.core.locks import advisory_lock


from sqlalchemy import select, func, update
from app.core.database import get_session_maker
from app.models.lead import Lead, SearchHistory
from app.models.campaign import Campaign, EmailOutreach
from app.models.email_event import EmailEvent
from app.models.daily_report import DailyReport
from app.config import get_settings

settings = get_settings()

from app.modules.notifications.telegram_bot import send_telegram_alert
from app.modules.discovery.google_places import GooglePlacesClient
from app.modules.discovery.scraper import scrape_contact_email
from app.modules.qualification.scorer import qualify_lead
from app.modules.personalization.groq_client import GroqClient
from app.modules.personalization.email_generator import render_email_html
from app.modules.personalization.pdf_generator import generate_proposal_pdf
from app.modules.outreach.email_sender import send_email
from app.modules.tracking.reply_tracker import fetch_recent_replies
from app.modules.reporting.excel_builder import generate_daily_report_excel
from app.modules.reporting.email_reporter import send_daily_report_email
from app.modules.personalization.proposal_xlsx_generator import generate_proposal_xlsx
from app.modules.demo_builder.generator import generate_demo_for_lead


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Discovery
# ─────────────────────────────────────────────────────────────────────────────

async def run_discovery_stage(manual: bool = False):
    """
    Executes the discovery phase of the lead generation pipeline.
    Discovers prospective leads via Google Places API and inserts verified new leads.

    International support:
      - Generates targets with full location hierarchy (country → region → city → sub_area)
      - Uses regionCode and locationBias for precise geographic scoping
      - Pagination fetches up to 60 results per location-category pair
      - Extracts structured geo data from addressComponents

    Deduplication rules:
      - place_id match  → skip entirely (never overwrite discovered_at)
      - email match     → skip entirely (prevents duplicate outreach to same client)
    """
    logger.info("Starting Dynamic Discovery")

    if not job_manager.is_job_active("discovery", ignore_global_hold=manual):
        logger.warning("🚨 [discovery] is HOLD. Skipping discovery stage.")
        return

    discovered_count = 0
    client = GooglePlacesClient()
    groq_client = GroqClient()
    seen_place_ids: set = set()
    today = date.today()
    session_maker = get_session_maker()

    from app.modules.discovery.google_places import get_radius_for_depth, extract_geo_from_place

    # 1. Initialize or update Daily Report in a brief, locked session
    async with advisory_lock("pipeline_init"):
        async with session_maker() as db:
            report_stmt = select(DailyReport).where(DailyReport.report_date == today)
            report_res  = await db.execute(report_stmt)
            db_report   = report_res.scalars().first()

            if not db_report:
                db_report = DailyReport(
                    report_date=today,
                    pipeline_status="running",
                    pipeline_started_at=datetime.now(timezone.utc),
                )
                db.add(db_report)
            else:
                db_report.pipeline_status    = "running"
                db_report.pipeline_started_at = datetime.now(timezone.utc)
            
            await db.commit()

    # 2. Fetch exclusion data and generate targets in a brief, locked session
    try:
        async with advisory_lock("pipeline_discovery_targets"):
            async with session_maker() as db:
                sixty_days_ago = datetime.now(timezone.utc) - timedelta(days=60)
                hist_res = await db.execute(
                    select(SearchHistory).where(SearchHistory.created_at >= sixty_days_ago)
                )
                recent_searches = hist_res.scalars().all()
                exclude_locations = [
                    {
                        "country_code": h.country_code,
                        "city": h.city,
                        "sub_area": h.sub_area,
                    }
                    for h in recent_searches
                ]
                exclude_categories = list({h.category for h in recent_searches})

                country_focus = [
                    c.strip()
                    for c in settings.DISCOVERY_COUNTRY_FOCUS.split(",")
                    if c.strip()
                ] or None

                targets = await groq_client.generate_daily_targets(
                    exclude_locations,
                    exclude_categories,
                    country_focus=country_focus,
                    depth=settings.DISCOVERY_DEPTH,
                    target_count=settings.DISCOVERY_TARGET_COUNT,
                )
                logger.info(f"Generated targets for today: {targets}")

        # 3. Process each target individually
        for target in targets:
            country      = target.get("country")
            country_code = target.get("country_code")
            region       = target.get("region")
            city         = target.get("city")
            sub_area     = target.get("sub_area")
            category     = target.get("category")

            if not city or not category:
                continue

            location_parts = [sub_area, city, region, country]
            location_str = ", ".join([p for p in location_parts if p])
            radius = get_radius_for_depth(sub_area, city, region)

            # BRIEF LOCK: Only for the Google Search + History Record
            async with advisory_lock(f"discovery_search_{city}_{category}"):
                # Fetch from Google Places (Network call)
                places = await client.search_places_paginated(
                    location=location_str,
                    category=category,
                    country_code=country_code,
                    radius=radius,
                    max_pages=settings.DISCOVERY_MAX_PAGES,
                )

                # Record search history immediately
                async with session_maker() as db:
                    db.add(SearchHistory(
                        country=country,
                        country_code=country_code,
                        region=region,
                        city=city,
                        sub_area=sub_area,
                        category=category,
                        location_depth=settings.DISCOVERY_DEPTH,
                        results_count=len(places),
                    ))
                    await db.commit()

            if not places:
                continue

            # NO LOCK during scraping phase (the long part)
            for place in places:
                # BREAK if discovery batch limit reached
                if discovered_count >= settings.DISCOVERY_BATCH_LIMIT:
                    logger.info(f"Discovery batch limit reached ({settings.DISCOVERY_BATCH_LIMIT}). Stopping current run.")
                    break

                place_id = place["id"]
                
                # Check existence in a quick read session
                async with session_maker() as db:
                    existing_res = await db.execute(
                        select(Lead.place_id).where(Lead.place_id == place_id)
                    )
                    if existing_res.scalars().first() or place_id in seen_place_ids:
                        continue
                
                seen_place_ids.add(place_id)
                website_url = place.get("websiteUri")
                email = None
                
                # SCRAPE: Long network call, no DB session or advisory lock held.
                if website_url:
                    email = await scrape_contact_email(website_url)

                # Final Save Session: Minimal duration
                async with session_maker() as db:
                    if email:
                        # Final email deduplication check
                        email_check = await db.execute(
                            select(Lead).where(Lead.email == email)
                        )
                        if email_check.scalars().first():
                            logger.info(f"Skipping {place.get('displayName', {}).get('text')}: email {email} already in use.")
                            continue

                    geo = extract_geo_from_place(place, target)
                    lead = Lead(
                        place_id        = place["id"],
                        business_name   = place.get("displayName", {}).get("text", "Unknown"),
                        category        = category,
                        address         = place.get("formattedAddress"),
                        city            = city,
                        phone           = place.get("nationalPhoneNumber"),
                        website_url     = website_url,
                        google_maps_url = place.get("googleMapsUri"),
                        rating          = place.get("rating"),
                        review_count    = place.get("userRatingCount"),
                        email           = email,
                        status          = "discovered",
                        raw_places_data = place,
                        # International location fields
                        country         = geo.get("country"),
                        country_code    = geo.get("country_code"),
                        region          = geo.get("region"),
                        sub_area        = geo.get("sub_area"),
                        postal_code     = geo.get("postal_code"),
                        latitude        = geo.get("latitude"),
                        longitude       = geo.get("longitude"),
                    )
                    db.add(lead)
                    await db.commit()
                    discovered_count += 1

            # Outer break if batch limit reached
            if discovered_count >= settings.DISCOVERY_BATCH_LIMIT:
                break

        # 4. Mark report as completed in a final briefly locked session
        async with advisory_lock("pipeline_finalize"):
            async with session_maker() as db:
                report_stmt = select(DailyReport).where(DailyReport.report_date == today)
                res = await db.execute(report_stmt)
                db_report = res.scalars().first()
                if db_report:
                    db_report.pipeline_status   = "completed"
                    db_report.pipeline_ended_at = datetime.now(timezone.utc)
                    await db.commit()

        if discovered_count > 0:
            await send_telegram_alert(
                f"Discovery phase completed. Identified {discovered_count} new leads."
            )

    except Exception as e:
        logger.exception("Error in discovery stage")
        async with session_maker() as db:
            report_stmt = select(DailyReport).where(DailyReport.report_date == today)
            res = await db.execute(report_stmt)
            db_report = res.scalars().first()
            if db_report:
                db_report.pipeline_status = "failed"
                db_report.error_log       = f"{type(e).__name__}: {str(e).split(chr(10))[0][:200]}"
                await db.commit()
        raise e


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Qualification
# ─────────────────────────────────────────────────────────────────────────────

async def run_qualification_stage(manual: bool = False):
    """
    Executes the qualification phase of the lead generation pipeline.
    Analyzes digital footprints of new leads to compute qualification scores.

    Status outcomes:
      qualified        → score >= 50, has email   → proceeds to email outreach
      phone_qualified  → score >= 50, phone only  → manual call / WhatsApp alert
      rejected         → score < 50 or no contact method
    """
    logger.info("Starting Qualification")

    if not job_manager.is_job_active("qualification", ignore_global_hold=manual):
        logger.warning("🚨 [qualification] is HOLD. Skipping qualification stage.")
        return

    async with advisory_lock("pipeline_qualification"):
        qualified_count      = 0
        phone_qualified_count = 0
        phone_qualified_leads: list[Lead] = []

        async with get_session_maker()() as db:
            # Query "discovered" and "qualification_error" leads in batches
            # qualification_error leads get retried automatically on next run
            result = await db.execute(
                select(Lead)
                .where(Lead.status.in_(["discovered", "qualification_error"]))
                .order_by(Lead.id.asc())
                .limit(settings.QUALIFICATION_BATCH_LIMIT)
            )
            leads = result.scalars().all()

            if not leads:
                logger.info("No discovered leads found for qualification.")
                return

            logger.info(f"Processing batch of {len(leads)} leads for qualification.")

            for lead in leads:
                try:
                    is_qualified, score, notes = await qualify_lead(lead, db)
                    lead.ai_score            = score
                    lead.qualification_notes = notes

                    if is_qualified and lead.email:
                        lead.status      = "qualified"
                        lead.qualified_at = datetime.now(timezone.utc)
                        qualified_count  += 1

                    elif is_qualified and lead.phone and not lead.email:
                        lead.status       = "phone_qualified"
                        lead.qualified_at = datetime.now(timezone.utc)
                        phone_qualified_count += 1
                        phone_qualified_leads.append(lead)

                    else:
                        lead.status = "rejected"

                except Exception as e:
                    logger.error(
                        f"Qualification failed for lead {lead.id} "
                        f"({lead.business_name}): {e}"
                    )
                    # Mark as qualification_error instead of silent rejection
                    # so the lead can be retried on the next pipeline run
                    lead.status = "qualification_error"
                    # Sanitize: only store exception type and first line, no stack traces or URLs
                    safe_error = type(e).__name__
                    first_line = str(e).split('\n')[0][:150]
                    lead.qualification_notes = f"Error during qualification: {safe_error}: {first_line}"

            if leads:
                await db.commit()

            if qualified_count > 0 or phone_qualified_count > 0:
                msg = (
                    f"✅ Qualification complete.\n"
                    f"📧 Email qualified: {qualified_count}\n"
                    f"📞 Phone qualified: {phone_qualified_count}"
                )
                await send_telegram_alert(msg)

            # WhatsApp / Telegram alert for every phone-only Tier A lead
            if phone_qualified_leads:
                from app.modules.notifications.whatsapp_bot import send_whatsapp_alert

                for lead in phone_qualified_leads:
                    if lead.lead_tier == "A":
                        hot_msg = (
                            f"📞 TIER A PHONE LEAD — {lead.business_name}\n"
                            f"City: {lead.city}, {lead.country or ''} | Category: {lead.category}\n"
                            f"Score: {lead.ai_score}/100\n"
                            f"Phone: {lead.phone}\n"
                            f"Notes: {lead.qualification_notes[:200] if lead.qualification_notes else 'N/A'}\n"
                            f"Maps: {lead.google_maps_url or 'N/A'}"
                        )
                        await send_telegram_alert(hot_msg)
                        await send_whatsapp_alert(hot_msg)

                # Send a compact summary list for all phone leads to Telegram
                summary_lines = [
                    f"  • {l.business_name} ({l.city}, {l.country or ''}) — {l.phone} — Tier {l.lead_tier}"
                    for l in phone_qualified_leads
                ]
                await send_telegram_alert(
                    f"📞 Phone-qualified leads ({phone_qualified_count}):\n"
                    + "\n".join(summary_lines)
                )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

import hmac
import hashlib

def _generate_tracking_token(lead_id, campaign_id) -> str:
    """
    Generates a secure, URL-safe base64 token for tracking email engagement.
    Includes an HMAC signature for integrity and to prevent IDOR attacks.
    """
    payload = f"{lead_id}_{campaign_id}"
    secret = settings.SECURITY_SALT.encode()
    
    # Calculate signature
    signature = hmac.new(
        secret,
        payload.encode(),
        hashlib.sha256
    ).digest()
    
    # Bundle payload + signature
    # Format: base64(payload) . base64(signature)
    b64_payload = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    b64_sig = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    
    return f"{b64_payload}.{b64_sig}"


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Personalization  (email-qualified leads only)
# ─────────────────────────────────────────────────────────────────────────────

async def run_personalization_stage(manual: bool = False):
    """
    Executes the personalization phase of the lead generation pipeline.
    Constructs tailored proposal content and PDFs, then queues emails.

    Only processes leads with status = "qualified" (has email).
    Phone-qualified leads are handled manually via the alerts sent in Stage 2.
    """
    logger.info("Starting Personalization")

    if not job_manager.is_job_active("personalization", ignore_global_hold=manual):
        logger.warning("🚨 [personalization] is HOLD. Skipping personalization stage.")
        return

    async with advisory_lock("pipeline_personalization"):
        pers_count  = 0
        groq_client = GroqClient()

        async with get_session_maker()() as db:
            # Ensure today's campaign exists
            today = date.today()
            camp_res = await db.execute(
                select(Campaign).where(Campaign.campaign_date == today).limit(1)
            )
            campaign = camp_res.scalars().first()
            if not campaign:
                campaign = Campaign(name=f"Daily Outreach {today}", campaign_date=today)
                db.add(campaign)
                await db.flush()

            # Only email-qualified leads go through automated personalization
            # Processed in batches to stay within AI rate limits and memory constraints
            result = await db.execute(
                select(Lead)
                .where(Lead.status == "qualified")
                .order_by(Lead.id.asc())
                .limit(settings.PERSONALIZATION_BATCH_LIMIT)
            )
            leads = result.scalars().all()

            if not leads:
                logger.debug("No qualified leads found for personalization.")
                return

            logger.info(f"Processing batch of {len(leads)} leads for personalization.")

            for lead in leads:
                try:
                    website_content: dict = {}
                    if lead.website_url and lead.has_website:
                        from app.modules.enrichment.website_content_extractor import (
                            extract_website_content,
                        )
                        website_content = await extract_website_content(lead.website_url)

                        lead.website_title         = website_content.get("page_title")
                        lead.website_copyright_year = website_content.get("copyright_year")
                        lead.is_mobile_responsive  = website_content.get("is_mobile_responsive")
                        lead.has_online_booking    = website_content.get("has_online_booking")
                        lead.has_ecommerce         = website_content.get("has_ecommerce")

                    from app.modules.enrichment.competitor_finder import find_top_competitor
                    competitor = await find_top_competitor(
                        lead.category, lead.city, db,
                        country_code=lead.country_code,
                    )

                    # 1. AI-generated email content
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

                    # 2. PDF Proposal — modern multi-section visual document
                    pdf_path = generate_proposal_pdf(
                        business_name=lead.business_name,
                        category=lead.category,
                        benefits=ai_data.get('benefits', []),
                        output_filename=f"Proposal_{lead.id}.pdf",
                        rating=lead.rating,
                        review_count=lead.review_count,
                        city=lead.city,
                        qualification_notes=lead.qualification_notes,
                    )

                    # 2b. Companion Excel workbook — ROI projection, competitor gap, roadmap
                    xlsx_path = generate_proposal_xlsx(
                        business_name=lead.business_name,
                        category=lead.category,
                        benefits=ai_data.get('benefits', []),
                        output_filename=f"Proposal_{lead.id}.xlsx",
                        rating=lead.rating,
                        review_count=lead.review_count,
                        city=lead.city,
                    )

                    # 2c. Demo Website Generation (ISOLATED — runs BEFORE email render)
                    # Only for no-website leads; fully wrapped in its own try/except.
                    # If this fails, the email still sends without the demo link.
                    if not lead.has_website and settings.DEMO_GENERATION_ENABLED:
                        try:
                            await generate_demo_for_lead(lead)
                        except Exception as demo_err:
                            logger.warning(
                                f"Demo generation failed for lead {lead.id} "
                                f"({lead.business_name}), continuing with normal email: {demo_err}"
                            )

                    # 3. Create Outreach Queue Record — attach both files
                    attachments = [p for p in [pdf_path, xlsx_path] if p]
                    tracking_token = _generate_tracking_token(lead.id, campaign.id)

                    # Build demo URL if demo was generated for this lead
                    demo_url = None
                    if (
                        not lead.has_website
                        and lead.demo_site_status == "generated"
                        and lead.generated_demo_html
                    ):
                        demo_url = f"{settings.FRONTEND_DOMAIN}/demo/{lead.id}"

                    html_body = render_email_html(
                        {"business_name": lead.business_name},
                        ai_data.get('body_html', ''),
                        tracking_token,
                        settings.APP_URL,
                        demo_url=demo_url,
                    )

                    outreach = EmailOutreach(
                        lead_id         = lead.id,
                        campaign_id     = campaign.id,
                        to_email        = lead.email,
                        subject         = ai_data.get(
                            'subject', f"Digital Growth for {lead.business_name}"
                        ),
                        body_html       = html_body,
                        tracking_token  = tracking_token,
                        ai_generated    = True,
                        has_attachment  = bool(attachments),
                        attachment_names = attachments,
                        status          = "queued",
                    )
                    db.add(outreach)

                    campaign.total_leads += 1
                    lead.status = "queued_for_send"
                    pers_count  += 1

                except Exception as e:
                    logger.error(f"Personalization failed for lead {lead.id} ({lead.business_name}): {e}")
                    # Keep status as 'qualified' so it can be retried or handled manually
                    continue

            if leads:
                await db.commit()
                if pers_count > 0:
                    await send_telegram_alert(
                        f"Personalization phase completed. "
                        f"Queued {pers_count} customized proposals for automated dispatch."
                    )


# ─────────────────────────────────────────────────────────────────────────────
# Stage 4 — Outreach dispatch
# ─────────────────────────────────────────────────────────────────────────────

async def run_outreach_stage(manual: bool = False):
    """
    Executes the outreach phase of the lead generation pipeline.
    Dispatches queued emails sequentially with a 2-second gap between sends.
    Commits after each successful email to prevent batch rollback loss.
    """
    logger.info("Starting Outreach Dispatch")

    if not job_manager.is_job_active("outreach", ignore_global_hold=manual):
        logger.warning("🚨 [outreach] is HOLD. Skipping outreach stage.")
        return

    async with advisory_lock("pipeline_outreach"):
        sent_count = 0

        async with get_session_maker()() as db:
            # Dispatch queued emails in batches to protect domain reputation and prevent timeouts
            result = await db.execute(
                select(EmailOutreach)
                .where(EmailOutreach.status == "queued")
                .order_by(EmailOutreach.id.asc())
                .limit(settings.OUTREACH_BATCH_LIMIT)
            )
            queued_emails = result.scalars().all()

            if not queued_emails:
                logger.debug("No queued emails found for outreach dispatch.")
                return

            logger.info(f"Processing batch of {len(queued_emails)} emails for outreach.")

            for email_task in queued_emails:
                attachments = email_task.attachment_names if email_task.has_attachment else []
                
                try:
                    success = await send_email(
                        to_email     = email_task.to_email,
                        subject      = email_task.subject,
                        html_content = email_task.body_html,
                        attachment_paths = attachments,
                    )

                    # Retry up to 2 more times on transient failures
                    for attempt in range(2, 4):
                        if success:
                            break
                        logger.warning(f"Retry {attempt}/3 for email to {email_task.to_email}")
                        await asyncio.sleep(3 * attempt)
                        success = await send_email(
                            to_email     = email_task.to_email,
                            subject      = email_task.subject,
                            html_content = email_task.body_html,
                            attachment_paths = attachments,
                        )

                    if success:
                        email_task.status  = "sent"
                        email_task.sent_at = datetime.now(timezone.utc)
                        sent_count += 1

                        # Update lead status
                        l_res = await db.execute(
                            select(Lead).where(Lead.id == email_task.lead_id)
                        )
                        lead = l_res.scalars().first()
                        if lead:
                            lead.status       = "email_sent"
                            lead.email_sent_at = datetime.now(timezone.utc)

                            from app.modules.outreach.followup_engine import schedule_followup
                            await schedule_followup(lead, db)

                        # Update campaign counters
                        c_res = await db.execute(
                            select(Campaign).where(Campaign.id == email_task.campaign_id)
                        )
                        campaign = c_res.scalars().first()
                        if campaign:
                            campaign.emails_sent += 1
                            if campaign.status == "pending":
                                campaign.status     = "active"
                                campaign.started_at = datetime.now(timezone.utc)

                        # Commit immediately per email — prevents batch rollback loss
                        await db.commit()
                    else:
                        email_task.status = "failed"

                except Exception as e:
                    logger.error(f"Error during email dispatch or DB update for task {email_task.id}: {e}")
                    email_task.status = "failed"
                finally:
                    # Clean up temp PDF/XLSX regardless of DB/SMTP outcome
                    if attachments:
                        for att in attachments:
                            if os.path.exists(att):
                                try:
                                    os.remove(att)
                                except Exception as cleanup_e:
                                    logger.warning(f"Failed to clean up attachment {att}: {cleanup_e}")

                # Throttle to avoid spam-filter triggers
                await asyncio.sleep(2)

            if queued_emails:
                await db.commit()
                if sent_count > 0:
                    await send_telegram_alert(
                        f"Outreach phase completed. "
                        f"Successfully dispatched {sent_count} communications."
                    )


# ─────────────────────────────────────────────────────────────────────────────
# Stage 5 — Reply polling  (runs every 30 min via APScheduler)
# ─────────────────────────────────────────────────────────────────────────────

async def poll_replies(manual: bool = False):
    """
    Monitors the reply inbox via IMAP and updates lead status on replies.
    Also classifies the reply intent and drafts an AI response for hot leads.
    """
    logger.info("Polling for replies")

    if not job_manager.is_job_active("reply_poll", ignore_global_hold=manual):
        logger.warning("🚨 [reply_poll] is HOLD. Skipping reply polling.")
        return

    async with advisory_lock("pipeline_reply_poll"):
        replies = await fetch_recent_replies(since_minutes=30)

        async with get_session_maker()() as db:
            for sender_email, subject, reply_time, body in replies:
                if not sender_email:
                    continue

                stmt = (
                    select(Lead)
                    .where(Lead.email == sender_email)
                    .order_by(Lead.created_at.desc())
                    .limit(1)
                )
                res  = await db.execute(stmt)
                lead = res.scalars().first()

                if not lead or lead.status == "replied":
                    continue

                try:
                    lead.status          = "replied"
                    lead.first_replied_at = reply_time

                    # Update associated outreach record and campaign metrics
                    out_res = await db.execute(
                        select(EmailOutreach)
                        .where(EmailOutreach.lead_id == lead.id)
                        .order_by(EmailOutreach.created_at.desc())
                        .limit(1)
                    )
                    outreach = out_res.scalars().first()
                    if outreach:
                        if outreach.status != "replied":
                            outreach.status = "replied"

                        camp_res = await db.execute(
                            select(Campaign).where(Campaign.id == outreach.campaign_id)
                        )
                        campaign = camp_res.scalars().first()
                        if campaign:
                            campaign.replies_received += 1

                    # Classify reply intent
                    from app.modules.tracking.reply_classifier import (
                        classify_reply, draft_reply_response,
                    )
                    from app.modules.notifications.whatsapp_bot import send_whatsapp_alert

                    classification_data      = await classify_reply(body, subject)
                    lead.reply_classification = classification_data.get("classification")
                    lead.reply_confidence     = classification_data.get("confidence")
                    lead.reply_key_signal     = classification_data.get("key_signal")

                    if lead.reply_classification in [
                        "interested", "question", "pricing_inquiry"
                    ]:
                        draft = await draft_reply_response(
                            lead, body, lead.reply_classification
                        )
                        lead.suggested_reply_draft = draft

                        hot_msg = (
                            f"🔥 INTERESTED REPLY — {lead.business_name}\n"
                            f"Signal: {lead.reply_key_signal}\n"
                            f"Reply draft saved. Review at /api/v1/leads/{lead.id}"
                        )
                        await send_telegram_alert(hot_msg)
                        await send_whatsapp_alert(hot_msg)
                    else:
                        alert_msg = (
                            f"📩 Reply Detected.\n"
                            f"Lead: {lead.business_name}\n"
                            f"Classification: {lead.reply_classification}\n"
                            f"Email: {lead.email}"
                        )
                        await send_telegram_alert(alert_msg)
                        await send_whatsapp_alert(alert_msg)

                    await db.commit()

                    # Cancel any pending follow-ups now that the lead has replied
                    from app.modules.outreach.followup_engine import cancel_followup_sequence
                    await cancel_followup_sequence(lead.id, db)

                except Exception as e:
                    await db.rollback()
                    logger.error(f"Error processing reply for {sender_email}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Stage 6 — Daily report  (runs at 23:30 via APScheduler)
# ─────────────────────────────────────────────────────────────────────────────

async def generate_daily_report(manual: bool = False):
    """
    Generates the daily analytical report and dispatches it to admins.

    Counts both 'qualified' and 'phone_qualified' leads in the qualified total
    so the report accurately reflects all leads that passed the scoring threshold.
    """
    logger.info("Generating Daily Report")

    if not job_manager.is_job_active("daily_report", ignore_global_hold=manual):
        logger.warning("🚨 [daily_report] is HOLD. Skipping daily report generation.")
        return

    async with advisory_lock("pipeline_daily_report"):
        today = date.today()

        try:
            async with get_session_maker()() as db:
                # Aggregated metrics for report_data
                leads_discovered = await db.scalar(
                    select(func.count(Lead.id)).where(func.date(Lead.discovered_at) == today)
                )
                leads_qualified = await db.scalar(
                    select(func.count(Lead.id)).where(
                        (func.date(Lead.qualified_at) == today) &
                        Lead.status.in_(["qualified", "phone_qualified"])
                    )
                )
                emails_sent = await db.scalar(
                    select(func.count(EmailOutreach.id)).where(
                        (func.date(EmailOutreach.sent_at) == today) &
                        (EmailOutreach.status == "sent")
                    )
                )

                # Fetch leads involved in today's activities for detail list
                leads_res = await db.execute(
                    select(Lead).where(
                        (func.date(Lead.discovered_at) == today)
                        | (func.date(Lead.email_sent_at) == today)
                        | (func.date(Lead.first_replied_at) == today)
                    )
                )
                report_leads = leads_res.scalars().all()

                report_data = {
                    "leads_discovered": leads_discovered or 0,
                    "leads_qualified": leads_qualified or 0,
                    "emails_sent": emails_sent or 0,
                    "emails_opened": len([l for l in report_leads if l.first_opened_at and l.first_opened_at.date() == today]),
                    "links_clicked": len([l for l in report_leads if l.first_clicked_at and l.first_clicked_at.date() == today]),
                    "replies_received": len([l for l in report_leads if l.first_replied_at and l.first_replied_at.date() == today]),
                }

                lead_dicts = [
                    {
                        "business_name":   l.business_name,
                        "category":        l.category,
                        "city":            l.city,
                        "country":         l.country,
                        "region":          l.region,
                        "email_sent_at":   l.email_sent_at,
                        "first_opened_at": l.first_opened_at,
                        "first_clicked_at": l.first_clicked_at,
                        "first_replied_at": l.first_replied_at,
                        "status":          l.status,
                        "phone":           l.phone,
                        "google_maps_url": l.google_maps_url,
                        "lead_tier":       l.lead_tier,
                    }
                    for l in report_leads
                ]

                # Excel generation fallback — report still sends even if Excel fails
                excel_path = None
                try:
                    excel_path = generate_daily_report_excel(report_data, lead_dicts, today)
                except Exception as excel_err:
                    logger.error(f"Excel report generation failed: {excel_err}. Sending report without attachment.")

                # Email dispatch fallback — log failure, don't crash pipeline
                try:
                    await send_daily_report_email(report_data, excel_path, today)
                except Exception as email_err:
                    logger.error(f"Daily report email dispatch failed: {email_err}")
                    await send_telegram_alert(
                        f"Daily report email failed: {email_err}. "
                        f"Stats: discovered={report_data['leads_discovered']}, "
                        f"sent={report_data['emails_sent']}"
                    )

                await db.commit()

        except Exception as e:
            logger.exception(f"Daily report generation failed: {e}")
            try:
                await send_telegram_alert(f"Daily report generation failed: {e}")
            except Exception:
                logger.error("Failed to send Telegram alert for report failure")


# ─────────────────────────────────────────────────────────────────────────────
# 🔴 CELERY APPROACH — PRESERVED FOR FUTURE SCALE
# Replace the async def functions above with these decorators
# when reactivating Celery:
#
# from app.tasks.celery_app import celery_app
#
# @celery_app.task(name="app.tasks.daily_pipeline.run_discovery_task")
# def run_discovery_task():
#     logger.info("Executing Discovery Task via Celery")
#     try:
#         run_async(run_discovery_stage())
#     except Exception as e:
#         logger.error(f"Discovery Failed: {e}")
#         run_async(send_telegram_alert(f"Pipeline Error (Discovery): {e}"))
#
# (repeat pattern for each stage)
# ─────────────────────────────────────────────────────────────────────────────