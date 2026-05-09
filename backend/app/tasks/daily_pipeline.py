"""
Daily lead generation pipeline execution module.
Orchestrates discovery, qualification, personalization, outreach, and reporting workflows.

Multi-Freelancer Architecture:
  Each pipeline stage accepts an optional ``user_id`` parameter. When present, the stage
  operates exclusively on data belonging to that freelancer. The scheduler dispatches
  each stage once per active freelancer via ``dispatch_stage_for_all_freelancers()``.

  Manual triggers always run for the requesting freelancer only, and bypass
  freelancer-level HOLD (but respect global HOLD).
"""
import asyncio
import base64
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from loguru import logger
from app.core.job_manager import job_manager
from app.core.locks import advisory_lock


from sqlalchemy import select, func, update
from app.core.database import get_session_maker
from app.models.lead import Lead, SearchHistory
from app.models.campaign import Campaign, EmailOutreach
from app.models.email_event import EmailEvent
from app.models.daily_report import DailyReport
from app.config import get_settings, get_production_status

settings = get_settings()

from app.modules.notifications.telegram_bot import send_telegram_alert
from app.modules.discovery.google_places import GooglePlacesClient
from app.core.exceptions import QuotaExceededException
from app.modules.discovery.scraper import scrape_contact_email
from app.models.freelancer_discovery_config import FreelancerDiscoveryConfig
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
from app.modules.personalization.booking_utils import get_resolved_booking_url
from app.modules.personalization.signature_renderer import get_freelancer_signature_html


# ─────────────────────────────────────────────────────────────────────────────
# Multi-Freelancer Dispatcher
# ─────────────────────────────────────────────────────────────────────────────

async def dispatch_stage_for_all_freelancers(stage_func, stage_name: str):
    """
    Dispatches a pipeline stage for every active freelancer.

    Called by the scheduler for daily pipeline runs. Iterates over all
    freelancers whose production_status is RUN and executes the stage
    function with their user_id.

    Each per-freelancer run is recorded in the per-user pipeline tracker
    (queued → running → completed / failed / skipped) so the Pipeline Log
    UI shows scheduled runs alongside manual ones, with the trigger
    source tagged as ``scheduler``.

    Notifications: the same stage_started / stage_finished / stage_failed
    feed entries that manual triggers raise (via ``app.core.job_queue``)
    are emitted here too, scoped strictly to the freelancer the run is
    being executed for. Each user's notification preferences gate whether
    the row + push are actually delivered — see
    ``app.modules.notifications.events`` for the per-user gate.

    Args:
        stage_func: The async stage function to call (e.g., run_discovery_stage).
        stage_name: The job ID for status checking (e.g., 'discovery').
    """
    # Local imports keep the module-level import graph minimal and avoid
    # circulars between daily_pipeline and pipeline_tracker on cold boot.
    from app.core.pipeline_tracker import (
        enqueue_job,
        mark_running,
        mark_completed,
        mark_failed,
        mark_skipped,
        is_stage_busy,
        record_skipped_run,
        TRIGGER_SCHEDULER,
    )
    from app.modules.notifications import events as notif_events

    notif_session_maker = get_session_maker()

    async def _emit(event_fn, **kwargs) -> None:
        """Best-effort notification emit. Notifications are observability,
        not correctness, so swallow any failure rather than impact the
        stage outcome. Opens its own short-lived session so a failed
        notification can never poison the dispatch loop's state."""
        try:
            async with notif_session_maker() as ndb:
                await event_fn(ndb, **kwargs)
        except Exception as e:
            logger.debug(f"notify emit failed (non-fatal): {e}")

    # Global HOLD blocks everything
    if get_production_status() == "HOLD":
        logger.warning(f"🚨 Global PRODUCTION_STATUS is HOLD. Skipping {stage_name} for all freelancers.")
        return

    active_freelancer_ids = await job_manager.get_active_freelancers()

    if not active_freelancer_ids:
        logger.info(f"No active freelancers found for {stage_name}. Skipping.")
        return

    logger.info(f"Dispatching {stage_name} for {len(active_freelancer_ids)} freelancer(s).")

    for user_id in active_freelancer_ids:
        # Per-iteration try/except so a failure on one freelancer doesn't
        # break the dispatch for the rest.
        try:
            is_active = await job_manager.is_freelancer_pipeline_active(
                stage_name, user_id=user_id, is_manual=False
            )
            if not is_active:
                # Record the skip in the freelancer's log so they know
                # exactly why their scheduled run didn't fire.
                await enqueue_job(user_id, stage_name, triggered_by=TRIGGER_SCHEDULER)
                await mark_skipped(
                    user_id,
                    stage_name,
                    f"Skipped: {stage_name} is on HOLD for this freelancer",
                )
                logger.info(f"⏸️ {stage_name} skipped for freelancer {user_id} (HOLD).")
                continue

            # Don't stomp on a manual run that's currently queued or
            # running for the same (user, stage). Archive a synthetic
            # "skipped" history row so the freelancer can see why their
            # scheduled run was a no-op, then move on without touching
            # the in-flight job's active-map entry.
            if await is_stage_busy(user_id, stage_name):
                await record_skipped_run(
                    user_id,
                    stage_name,
                    f"Skipped: previous {stage_name} run is still in progress",
                    triggered_by=TRIGGER_SCHEDULER,
                )
                logger.info(
                    f"⏭️ {stage_name} skipped for freelancer {user_id} "
                    f"(previous run still in progress)."
                )
                continue

            logger.info(f"▶️ Running {stage_name} for freelancer {user_id}.")
            await enqueue_job(user_id, stage_name, triggered_by=TRIGGER_SCHEDULER)
            await mark_running(user_id, stage_name)

            # Live "stage running" card — strictly scoped to this freelancer.
            # The notification gate inside ``events`` consults this user's
            # per-job preference; a different freelancer's preference cannot
            # affect this emission because we always pass ``user_id``.
            await _emit(
                notif_events.stage_started,
                user_id=user_id,
                stage=stage_name,
                trigger="scheduled",
            )

            try:
                await stage_func(manual=False, user_id=user_id)
                await mark_completed(
                    user_id, stage_name, f"{stage_name} completed successfully"
                )
                await _emit(
                    notif_events.stage_finished,
                    user_id=user_id,
                    stage=stage_name,
                    summary=f"{stage_name.replace('_', ' ').title()} finished successfully.",
                )
            except asyncio.CancelledError:
                # Re-raise after best-effort marking. The active-map TTL
                # (24 h) sweeps the orphan if marking itself fails.
                try:
                    await mark_failed(
                        user_id, stage_name, "Cancelled during process shutdown"
                    )
                except Exception:
                    pass
                raise
            except Exception as e:
                await mark_failed(
                    user_id, stage_name, f"{type(e).__name__}: {str(e)[:200]}"
                )
                await _emit(
                    notif_events.stage_failed,
                    user_id=user_id,
                    stage=stage_name,
                    error=f"{type(e).__name__}: {str(e)[:200]}",
                )
                logger.exception(
                    f"Error running {stage_name} for freelancer {user_id}: {e}"
                )
        except asyncio.CancelledError:
            logger.info(f"🛑 {stage_name} cancelled for freelancer {user_id} during shutdown.")
            raise
        except Exception:
            # Catch-all so the for-loop keeps dispatching; tracker errors
            # already get a logger.exception inside the inner block.
            logger.exception(
                f"Outer dispatcher error for {stage_name} (user={user_id})"
            )


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Discovery
# ─────────────────────────────────────────────────────────────────────────────

async def run_discovery_stage(manual: bool = False, user_id: Optional[int] = None):
    """
    Executes the discovery phase of the lead generation pipeline.
    Discovers prospective leads via Google Places API and inserts verified new leads.

    Args:
        manual: True if triggered manually (bypasses freelancer-level HOLD).
        user_id: The freelancer's user ID. All discovered leads are associated with this user.
    """
    logger.info(f"Starting Dynamic Discovery (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active("discovery", user_id=user_id, is_manual=manual):
        logger.warning(f"🚨 [discovery] is HOLD for user {user_id}. Skipping discovery stage.")
        return

    discovered_count = 0
    client = GooglePlacesClient()
    groq_client = GroqClient()
    seen_place_ids: set = set()
    today = date.today()
    session_maker = get_session_maker()

    from app.modules.discovery.google_places import get_radius_for_depth, extract_geo_from_place

    # 1. Initialize or update Daily Report in a brief, locked session
    async with advisory_lock(f"pipeline_init_{user_id}"):
        async with session_maker() as db:
            report_stmt = select(DailyReport).where(
                DailyReport.report_date == today,
                DailyReport.user_id == user_id,
            )
            report_res  = await db.execute(report_stmt)
            db_report   = report_res.scalars().first()

            if not db_report:
                db_report = DailyReport(
                    report_date=today,
                    user_id=user_id,
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
        # Per-target lead cap. Populated only in manual mode; in auto mode
        # the global DISCOVERY_BATCH_LIMIT remains the only ceiling.
        per_target_caps: dict[tuple, int] = {}
        # Per-target running counts so the inner loop can honor
        # per_target_caps without piling all bookkeeping into one global int.
        per_target_counts: dict[tuple, int] = {}

        async with advisory_lock("pipeline_discovery_targets"):
            async with session_maker() as db:
                # ── Load this freelancer's discovery config first ─────────
                # Decides whether we use AI-picked targets (auto) or the
                # freelancer's hand-curated list (manual).
                discovery_cfg = None
                if user_id is not None:
                    cfg_res = await db.execute(
                        select(FreelancerDiscoveryConfig).where(
                            FreelancerDiscoveryConfig.user_id == user_id
                        )
                    )
                    discovery_cfg = cfg_res.scalars().first()

                manual_targets_raw: list[dict] = []
                if (
                    discovery_cfg is not None
                    and not discovery_cfg.auto_mode_enabled
                    and isinstance(discovery_cfg.pinned_targets, list)
                ):
                    manual_targets_raw = [
                        t for t in discovery_cfg.pinned_targets
                        if isinstance(t, dict)
                        and t.get("city")
                        and t.get("category")
                    ]

                if manual_targets_raw:
                    # ── Manual mode ──────────────────────────────────────
                    # The freelancer explicitly chose these areas. We
                    # bypass the 60-day SearchHistory dedup (per product
                    # decision) so re-search of recent areas is honored;
                    # Lead.place_id UNIQUE still prevents duplicate rows.
                    targets = []
                    for t in manual_targets_raw:
                        target = {
                            "country":      t.get("country"),
                            "country_code": t.get("country_code"),
                            "region":       t.get("region"),
                            "city":         t.get("city"),
                            "sub_area":     t.get("sub_area"),
                            "category":     t.get("category"),
                            # Carry the freelancer's chosen depth so the
                            # search radius reflects intent, not the
                            # global DISCOVERY_DEPTH default.
                            "_depth":       t.get("location_depth", "city"),
                            "_max_results": int(t.get("max_results") or 0),
                        }
                        targets.append(target)
                        # Build cap lookup keyed on the same tuple we'll
                        # use during the inner loop to attribute discoveries.
                        cap_key = (
                            target["city"],
                            target["sub_area"],
                            target["category"],
                        )
                        per_target_caps[cap_key] = max(
                            per_target_caps.get(cap_key, 0),
                            target["_max_results"],
                        )
                        per_target_counts.setdefault(cap_key, 0)
                    logger.info(
                        f"Discovery user_id={user_id}: MANUAL mode, "
                        f"{len(targets)} pinned target(s)."
                    )
                else:
                    # ── Auto mode (existing behavior) ─────────────────────
                    if (
                        discovery_cfg is not None
                        and not discovery_cfg.auto_mode_enabled
                    ):
                        # Manual ON but no targets — fall back to auto
                        # rather than block discovery, and warn so the
                        # freelancer notices in logs / pipeline tracker.
                        logger.warning(
                            f"Discovery user_id={user_id}: manual mode is on "
                            f"but no pinned targets configured — falling back "
                            f"to auto for this run."
                        )

                    sixty_days_ago = datetime.now(timezone.utc) - timedelta(days=60)
                    hist_query = select(SearchHistory).where(SearchHistory.created_at >= sixty_days_ago)
                    if user_id is not None:
                        hist_query = hist_query.where(SearchHistory.user_id == user_id)
                    hist_res = await db.execute(hist_query)
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
                    logger.info(
                        f"Discovery user_id={user_id}: AUTO mode, "
                        f"generated targets: {targets}"
                    )

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
            # In manual mode the freelancer picked the search depth
            # explicitly per-target; honor it. In auto mode we fall back
            # to the existing radius-by-presence helper.
            manual_depth = target.get("_depth")
            if manual_depth in ("sub_area", "city", "region", "country"):
                from app.modules.discovery.google_places import RADIUS_BY_DEPTH
                radius = RADIUS_BY_DEPTH.get(manual_depth, get_radius_for_depth(sub_area, city, region))
            else:
                radius = get_radius_for_depth(sub_area, city, region)
            cap_key = (city, sub_area, category)
            target_cap = per_target_caps.get(cap_key)  # None in auto mode

            # BRIEF LOCK: Only for the Google Search + History Record
            async with advisory_lock(f"discovery_search_{city}_{category}"):
                # Fetch from Google Places (Network call)
                # QuotaExceededException bubbles up from the client when the
                # API returns 429/401/403 — we catch it here to halt the
                # entire discovery run and alert the admin.
                try:
                    places = await client.search_places_paginated(
                        location=location_str,
                        category=category,
                        country_code=country_code,
                        radius=radius,
                        max_pages=settings.DISCOVERY_MAX_PAGES,
                    )
                except QuotaExceededException as qe:
                    logger.critical(
                        f"🚨 Google Places API quota/auth failure — "
                        f"pausing discovery for user_id={user_id}. {qe}"
                    )
                    await send_telegram_alert(
                        f"🚨 DISCOVERY PAUSED — Google Places API error "
                        f"(HTTP {qe.status_code}).\n"
                        f"User: {user_id}\n"
                        f"Details: {qe.message[:300]}\n"
                        f"Action: Check API key or quota in Google Cloud Console."
                    )
                    # Break from the outer target loop — no point sending
                    # further requests when the quota is exhausted.
                    break

                # Record search history immediately. ``location_depth`` now
                # reflects the per-target depth in manual mode (so the
                # SearchHistory row is faithful to what was actually
                # searched), with the global default in auto mode.
                effective_depth = (
                    target.get("_depth")
                    if target.get("_depth") in ("sub_area", "city", "region", "country")
                    else settings.DISCOVERY_DEPTH
                )
                async with session_maker() as db:
                    db.add(SearchHistory(
                        user_id=user_id,
                        country=country,
                        country_code=country_code,
                        region=region,
                        city=city,
                        sub_area=sub_area,
                        category=category,
                        location_depth=effective_depth,
                        results_count=len(places),
                    ))
                    await db.commit()

            if not places:
                continue

            # NO LOCK during scraping phase (the long part)
            for place in places:
                # Per-target slider cap (manual mode only). Hit the cap
                # for THIS pinned target → break to the next target,
                # don't end the whole run.
                if (
                    target_cap is not None
                    and per_target_counts.get(cap_key, 0) >= target_cap
                ):
                    logger.info(
                        f"Per-target cap reached for {cap_key} "
                        f"({target_cap} leads). Moving to next target."
                    )
                    break

                # Global batch limit (defense-in-depth: API validation
                # already keeps the slider total ≤ this cap, but we still
                # enforce it at runtime in case env was lowered between
                # config save and the pipeline run).
                if discovered_count >= settings.DISCOVERY_BATCH_LIMIT:
                    logger.info(f"Discovery batch limit reached ({settings.DISCOVERY_BATCH_LIMIT}). Stopping current run.")
                    break

                place_id = place["id"]
                
                # Check existence in a quick read session (scoped to this freelancer)
                async with session_maker() as db:
                    exist_query = select(Lead.place_id).where(Lead.place_id == place_id)
                    if user_id is not None:
                        exist_query = exist_query.where(Lead.user_id == user_id)
                    existing_res = await db.execute(exist_query)
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
                        # Final email deduplication check (scoped to this freelancer)
                        email_dedup_query = select(Lead).where(Lead.email == email)
                        if user_id is not None:
                            email_dedup_query = email_dedup_query.where(Lead.user_id == user_id)
                        email_check = await db.execute(email_dedup_query)
                        if email_check.scalars().first():
                            logger.info(f"Skipping {place.get('displayName', {}).get('text')}: email {email} already in use.")
                            continue

                    geo = extract_geo_from_place(place, target)
                    lead = Lead(
                        place_id        = place["id"],
                        user_id         = user_id,
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
                    # Per-target counter — only meaningful in manual mode,
                    # but always bumped so the dict stays consistent.
                    if cap_key in per_target_counts:
                        per_target_counts[cap_key] = per_target_counts.get(cap_key, 0) + 1

            # Outer break if batch limit reached
            if discovered_count >= settings.DISCOVERY_BATCH_LIMIT:
                break

        # 4. Mark report as completed in a final briefly locked session
        async with advisory_lock(f"pipeline_finalize_{user_id}"):
            async with session_maker() as db:
                report_stmt = select(DailyReport).where(
                    DailyReport.report_date == today,
                    DailyReport.user_id == user_id,
                )
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
            report_stmt = select(DailyReport).where(
                DailyReport.report_date == today,
                DailyReport.user_id == user_id,
            )
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

async def run_qualification_stage(manual: bool = False, user_id: Optional[int] = None):
    """
    Executes the qualification phase of the lead generation pipeline.
    Analyzes digital footprints of new leads to compute qualification scores.

    Args:
        manual: True if triggered manually (bypasses freelancer-level HOLD).
        user_id: The freelancer's user ID. Only qualifies leads belonging to this user.

    Status outcomes:
      qualified        → score >= 50, has email   → proceeds to email outreach
      phone_qualified  → score >= 50, phone only  → manual call / WhatsApp alert
      rejected         → score < 50 or no contact method
    """
    logger.info(f"Starting Qualification (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active("qualification", user_id=user_id, is_manual=manual):
        logger.warning(f"🚨 [qualification] is HOLD for user {user_id}. Skipping qualification stage.")
        return

    async with advisory_lock(f"pipeline_qualification_{user_id}"):
        qualified_count      = 0
        phone_qualified_count = 0
        phone_qualified_leads: list[Lead] = []

        async with get_session_maker()() as db:
            # Query "discovered" and "qualification_error" leads in batches
            # qualification_error leads get retried automatically on next run
            lead_query = (
                select(Lead)
                .where(Lead.status.in_(["discovered", "qualification_error"]))
                .order_by(Lead.id.asc())
                .limit(settings.QUALIFICATION_BATCH_LIMIT)
            )
            if user_id is not None:
                lead_query = lead_query.where(Lead.user_id == user_id)
            result = await db.execute(lead_query)
            leads = result.scalars().all()

            if not leads:
                logger.info(f"No discovered leads found for qualification (user_id={user_id}).")
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
import secrets

def _generate_tracking_token(lead_id, campaign_id) -> str:
    """
    Generates a secure, URL-safe base64 token for tracking email engagement.
    Includes an HMAC signature for integrity and to prevent IDOR attacks.

    A short random nonce is appended to the payload so two EmailOutreach
    rows for the same (lead, campaign) — produced when a freelancer
    retries a manual send the same day (Unlock + Send), or when the daily
    outreach stage retries after an SMTP failure — receive different
    tokens. EmailOutreach.tracking_token has a UNIQUE constraint, so
    without the nonce the second INSERT would raise IntegrityError and
    strand the lead.

    Token format: ``base64(lead_id_campaign_id_nonce).base64(hmac_sig)``.
    Downstream consumers that only need ``lead_id`` (unsubscribe.py) split
    the payload on the first underscore, so the extra nonce segment is
    transparent to them.
    """
    nonce = secrets.token_urlsafe(6)
    payload = f"{lead_id}_{campaign_id}_{nonce}"
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

async def run_personalization_stage(manual: bool = False, user_id: Optional[int] = None):
    """
    Executes the personalization phase of the lead generation pipeline.
    Constructs tailored proposal content and PDFs, then queues emails.

    Args:
        manual: True if triggered manually (bypasses freelancer-level HOLD).
        user_id: The freelancer's user ID. Only personalizes leads belonging to this user.

    Only processes leads with status = "qualified" (has email).
    Phone-qualified leads are handled manually via the alerts sent in Stage 2.
    """
    logger.info(f"Starting Personalization (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active("personalization", user_id=user_id, is_manual=manual):
        logger.warning(f"🚨 [personalization] is HOLD for user {user_id}. Skipping personalization stage.")
        return

    async with advisory_lock(f"pipeline_personalization_{user_id}"):
        pers_count  = 0
        groq_client = GroqClient()

        async with get_session_maker()() as db:
            # Resolve the booking URL once per batch (system-wide or admin-specific)
            resolved_booking_url = await get_resolved_booking_url(db, user_id)

            # Ensure today's campaign exists for this freelancer
            today = date.today()
            camp_query = select(Campaign).where(Campaign.campaign_date == today)
            if user_id is not None:
                camp_query = camp_query.where(Campaign.user_id == user_id)
            camp_query = camp_query.limit(1)
            camp_res = await db.execute(camp_query)
            campaign = camp_res.scalars().first()
            if not campaign:
                campaign = Campaign(
                    name=f"Daily Outreach {today}",
                    campaign_date=today,
                    user_id=user_id,
                )
                db.add(campaign)
                await db.flush()

            # Only email-qualified leads go through automated personalization
            # Processed in batches to stay within AI rate limits and memory constraints
            lead_query = (
                select(Lead)
                .where(Lead.status == "qualified")
                .order_by(Lead.id.asc())
                .limit(settings.PERSONALIZATION_BATCH_LIMIT)
            )
            if user_id is not None:
                lead_query = lead_query.where(Lead.user_id == user_id)
            result = await db.execute(lead_query)
            leads = result.scalars().all()

            if not leads:
                logger.debug(f"No qualified leads found for personalization (user_id={user_id}).")
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

                    # Optional per-freelancer profile signature.
                    # Returns "" when toggle is off / data missing / on any error,
                    # so the pre-existing email body remains unchanged.
                    profile_signature_html = await get_freelancer_signature_html(
                        lead.user_id, db
                    )

                    html_body = render_email_html(
                        {"business_name": lead.business_name},
                        ai_data.get('body_html', ''),
                        tracking_token,
                        settings.APP_URL,
                        demo_url=demo_url,
                        booking_url=resolved_booking_url,
                        profile_signature_html=profile_signature_html,
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

async def run_outreach_stage(manual: bool = False, user_id: Optional[int] = None):
    """
    Executes the outreach phase of the lead generation pipeline.
    Dispatches queued emails sequentially with a 2-second gap between sends.
    Commits after each successful email to prevent batch rollback loss.

    Args:
        manual: True if triggered manually (bypasses freelancer-level HOLD).
        user_id: The freelancer's user ID. Only dispatches emails for this user's campaigns.
    """
    logger.info(f"Starting Outreach Dispatch (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active("outreach", user_id=user_id, is_manual=manual):
        logger.warning(f"🚨 [outreach] is HOLD for user {user_id}. Skipping outreach stage.")
        return

    async with advisory_lock(f"pipeline_outreach_{user_id}"):
        sent_count = 0

        async with get_session_maker()() as db:
            # Dispatch queued emails in batches to protect domain reputation and prevent timeouts
            outreach_query = (
                select(EmailOutreach)
                .where(EmailOutreach.status == "queued")
                .order_by(EmailOutreach.id.asc())
                .limit(settings.OUTREACH_BATCH_LIMIT)
            )
            if user_id is not None:
                outreach_query = outreach_query.join(
                    Campaign, EmailOutreach.campaign_id == Campaign.id
                ).where(Campaign.user_id == user_id)
            result = await db.execute(outreach_query)
            queued_emails = result.scalars().all()

            if not queued_emails:
                logger.debug(f"No queued emails found for outreach dispatch (user_id={user_id}).")
                return

            logger.info(f"Processing batch of {len(queued_emails)} emails for outreach.")

            for email_task in queued_emails:
                attachments = email_task.attachment_names if email_task.has_attachment else []
                
                try:
                    await send_email(
                        to_email     = email_task.to_email,
                        subject      = email_task.subject,
                        html_content = email_task.body_html,
                        attachment_paths = attachments,
                    )

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

                except Exception as e:
                    logger.error(f"Error during email dispatch or DB update for task {email_task.id}: {e}")
                    # Reset both the EmailOutreach AND the parent Lead so the
                    # send is retryable. Without this the Lead stays at
                    # ``queued_for_send`` and the EmailOutreach stays at
                    # ``failed`` — neither the next personalization run
                    # (which queries ``qualified``) nor the next outreach
                    # run (which queries ``queued``) would ever pick it
                    # up again, leaving the lead permanently stranded.
                    email_task.status = "failed"
                    try:
                        l_res = await db.execute(
                            select(Lead).where(Lead.id == email_task.lead_id)
                        )
                        failed_lead = l_res.scalars().first()
                        if failed_lead and failed_lead.status == "queued_for_send":
                            failed_lead.status = "qualified"
                            failed_lead.email_sent_at = None
                            failed_lead.followup_sequence_active = False
                            failed_lead.next_followup_at = None
                        await db.commit()
                    except Exception as rollback_err:
                        logger.warning(
                            f"Failed to reset lead state after SMTP failure for "
                            f"task {email_task.id}: {rollback_err}"
                        )
                        try:
                            await db.rollback()
                        except Exception:
                            pass
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

async def poll_replies(manual: bool = False, user_id: Optional[int] = None):
    """
    Monitors the reply inbox via IMAP and updates lead status on replies.
    Also classifies the reply intent and drafts an AI response for hot leads.

    Args:
        manual: True if triggered manually (bypasses freelancer-level HOLD).
        user_id: The freelancer's user ID. Only processes replies for this user's leads.
                 Note: IMAP polling fetches all replies; user_id filters lead matching.
    """
    logger.info(f"Polling for replies (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active("reply_poll", user_id=user_id, is_manual=manual):
        logger.warning(f"🚨 [reply_poll] is HOLD for user {user_id}. Skipping reply polling.")
        return

    async with advisory_lock(f"pipeline_reply_poll_{user_id}"):
        replies = await fetch_recent_replies(since_minutes=30)

        async with get_session_maker()() as db:
            for sender_email, subject, reply_time, body in replies:
                if not sender_email:
                    continue

                lead_query = (
                    select(Lead)
                    .where(Lead.email == sender_email)
                    .order_by(Lead.created_at.desc())
                    .limit(1)
                )
                if user_id is not None:
                    lead_query = lead_query.where(Lead.user_id == user_id)
                stmt = lead_query
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

async def generate_daily_report(manual: bool = False, user_id: Optional[int] = None):
    """
    Generates the daily analytical report and dispatches it to admins.

    Args:
        manual: True if triggered manually (bypasses freelancer-level HOLD).
        user_id: The freelancer's user ID. Generates report scoped to this user's data.

    Counts both 'qualified' and 'phone_qualified' leads in the qualified total
    so the report accurately reflects all leads that passed the scoring threshold.
    """
    logger.info(f"Generating Daily Report (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active("daily_report", user_id=user_id, is_manual=manual):
        logger.warning(f"🚨 [daily_report] is HOLD for user {user_id}. Skipping daily report generation.")
        return

    async with advisory_lock(f"pipeline_daily_report_{user_id}"):
        today = date.today()

        try:
            async with get_session_maker()() as db:
                # Build user filter for all queries
                def _user_filter(query):
                    if user_id is not None:
                        return query.where(Lead.user_id == user_id)
                    return query

                # Aggregated metrics for report_data
                leads_discovered = await db.scalar(
                    _user_filter(
                        select(func.count(Lead.id)).where(func.date(Lead.discovered_at) == today)
                    )
                )
                leads_qualified = await db.scalar(
                    _user_filter(
                        select(func.count(Lead.id)).where(
                            (func.date(Lead.qualified_at) == today) &
                            Lead.status.in_(["qualified", "phone_qualified"])
                        )
                    )
                )

                # Email sent count — filter via campaign.user_id for multi-tenant
                email_sent_query = (
                    select(func.count(EmailOutreach.id)).where(
                        (func.date(EmailOutreach.sent_at) == today) &
                        (EmailOutreach.status == "sent")
                    )
                )
                if user_id is not None:
                    email_sent_query = email_sent_query.join(
                        Campaign, EmailOutreach.campaign_id == Campaign.id
                    ).where(Campaign.user_id == user_id)
                emails_sent = await db.scalar(email_sent_query)

                # Fetch leads involved in today's activities for detail list
                leads_activity_query = select(Lead).where(
                    (func.date(Lead.discovered_at) == today)
                    | (func.date(Lead.email_sent_at) == today)
                    | (func.date(Lead.first_replied_at) == today)
                )
                if user_id is not None:
                    leads_activity_query = leads_activity_query.where(Lead.user_id == user_id)
                leads_res = await db.execute(leads_activity_query)
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
# Stage 7 — Directory Publishing (runs daily)
# ─────────────────────────────────────────────────────────────────────────────

async def publish_eligible_leads(manual: bool = False, user_id: Optional[int] = None):
    """
    Finds leads that are > 30 days old, active, and not overridden, and publishes them.
    """
    logger.info(f"Checking for directory-eligible leads (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active("publish_leads", user_id=user_id, is_manual=manual):
        logger.warning(f"🚨 [publish_leads] is HOLD for user {user_id}. Skipping publishing.")
        return

    async with advisory_lock(f"pipeline_publish_leads_{user_id}"):
        try:
            async with get_session_maker()() as db:
                thirty_days_ago = datetime.utcnow() - timedelta(days=30)
                
                stmt = (
                    update(Lead)
                    .where(
                        (Lead.is_public == False) &
                        (Lead.is_private_override == False) &
                        (Lead.discovered_at < thirty_days_ago) &
                        (Lead.status.notin_(["closed", "rejected", "bounced", "unsubscribed"]))
                    )
                    .values(is_public=True)
                )
                
                if user_id is not None:
                    stmt = stmt.where(Lead.user_id == user_id)
                
                res = await db.execute(stmt)
                await db.commit()
                
                if res.rowcount > 0:
                    logger.info(f"Successfully published {res.rowcount} leads to the public directory (user_id={user_id}).")
                
        except Exception as e:
            logger.exception(f"Directory publishing failed: {e}")

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