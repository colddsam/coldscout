"""
Daily lead generation pipeline execution module.
Orchestrates discovery, qualification, personalization, outreach, and reporting workflows.
"""
import asyncio
from loguru import logger
from datetime import date, datetime, timedelta
import uuid
import base64
import os
from dotenv import dotenv_values

def is_pipeline_active() -> bool:
    """
    Dynamically evaluates the .env configuration to determine if pipeline execution is permitted.
    Supports pausing execution without requiring a server reboot.
    """
    env_vars = dotenv_values(".env")
    return env_vars.get("PRODUCTION_STATUS", "RUN").upper() == "RUN"

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

async def run_discovery_stage():
    """
    Executes the discovery phase of the lead generation pipeline.
    Discovers prospective leads via Google Places API and inserts verified new leads.
    """
    logger.info("Starting Dynamic Discovery")
    
    if not is_pipeline_active():
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. Skipping discovery stage.")
        return
        
    discovered_count = 0
    client = GooglePlacesClient()
    groq_client = GroqClient()
    seen_place_ids = set()
    
    async with get_session_maker()() as db:
        # 1. Get recent searches (last 60 days) to prevent repetition
        sixty_days_ago = datetime.utcnow() - timedelta(days=60)
        hist_stmt = select(SearchHistory).where(SearchHistory.created_at >= sixty_days_ago)
        hist_res = await db.execute(hist_stmt)
        recent_searches = hist_res.scalars().all()
        
        exclude_cities = list(set([h.city for h in recent_searches]))
        exclude_categories = list(set([h.category for h in recent_searches]))
        
        # 2. Ask Groq for 2 fresh targets
        targets = await groq_client.generate_daily_targets(exclude_cities, exclude_categories)
        logger.info(f"Generated targets for today: {targets}")
        
        for target in targets:
            city = target.get("city")
            category = target.get("category")
            if not city or not category:
                continue
                
            # Log to history
            sh = SearchHistory(city=city, category=category)
            db.add(sh)
            
            # Fetch places
            places = await client.search_places(city, category, 5000)
            for place in places:
                place_id = place["id"]
                if place_id in seen_place_ids:
                    continue
                
                # Check DB for existing place_id (Same Business)
                check_stmt = select(Lead).where(Lead.place_id == place_id)
                check_result = await db.execute(check_stmt)
                if check_result.scalars().first():
                    seen_place_ids.add(place_id)
                    continue
                    
                seen_place_ids.add(place_id)
                
                # Try to scrape email if website is found
                website_url = place.get("websiteUri")
                email = None
                if website_url:
                    email = await scrape_contact_email(website_url)
                    
                # Strict Email Deduplication: Do not add if email already exists in DB (Same Client)
                if email:
                    email_check_stmt = select(Lead).where(Lead.email == email)
                    email_check_result = await db.execute(email_check_stmt)
                    if email_check_result.scalars().first():
                        logger.info(f"Skipping {place.get('displayName', {}).get('text')}: Email {email} already in use.")
                        continue
                    
                lead = Lead(
                    place_id=place["id"],
                    business_name=place.get("displayName", {}).get("text", "Unknown"),
                    category=category,
                    address=place.get("formattedAddress"),
                    city=city,
                    phone=place.get("nationalPhoneNumber"),
                    website_url=website_url,
                    google_maps_url=place.get("googleMapsUri"),
                    rating=place.get("rating"),
                    review_count=place.get("userRatingCount"),
                    email=email,
                    status="discovered",
                    raw_places_data=place,
                    notes=""
                )
                db.add(lead)
                discovered_count += 1
        
        if discovered_count > 0:
            await db.commit()
            await send_telegram_alert(f"Discovery phase completed. Identified {discovered_count} new prospective businesses (Targets: {targets})")


async def run_qualification_stage():
    """
    Executes the qualification phase of the lead generation pipeline.
    Analyzes digital footprints of new leads to compute qualification scores.
    """
    logger.info("Starting Qualification")
    
    if not is_pipeline_active():
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. Skipping qualification stage.")
        return
        
    qualified_count = 0
    
    async with get_session_maker()() as db:
        stmt = select(Lead).where(Lead.status == "discovered")
        result = await db.execute(stmt)
        leads = result.scalars().all()
        
        for lead in leads:
            is_qualified, score, notes = await qualify_lead(lead, db)
            lead.qualification_score = score
            lead.web_presence_notes = notes
            
            if is_qualified and lead.email: # Must have email to be useful
                lead.status = "qualified"
                lead.qualified_at = datetime.utcnow()
                qualified_count += 1
            else:
                lead.status = "rejected"
        
        if leads:
            await db.commit()
            if qualified_count > 0:
                await send_telegram_alert(f"Qualification phase completed. Approved {qualified_count} leads for personalized outreach sequence.")


def _generate_tracking_token(lead_id, campaign_id):
    """
    Generates a secure, URL-safe base64 token for tracking email engagement.
    """
    raw_token = f"{lead_id}_{campaign_id}"
    return base64.urlsafe_b64encode(raw_token.encode()).decode('utf-8')


async def run_personalization_stage():
    """
    Executes the personalization phase of the lead generation pipeline.
    Constructs tailored proposal content and PDFs, then queues emails.
    """
    logger.info("Starting Personalization")
    
    if not is_pipeline_active():
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. Skipping personalization stage.")
        return
        
    pers_count = 0
    groq_client = GroqClient()
    
    async with get_session_maker()() as db:
        # Check active campaign or create new
        today = date.today()
        camp_stmt = select(Campaign).where(Campaign.campaign_date == today).limit(1)
        camp_res = await db.execute(camp_stmt)
        campaign = camp_res.scalars().first()
        
        if not campaign:
            campaign = Campaign(name=f"Daily Outreach {today}", campaign_date=today)
            db.add(campaign)
            await db.flush()
            
        stmt = select(Lead).where(Lead.status == "qualified")
        result = await db.execute(stmt)
        leads = result.scalars().all()
        
        for lead in leads:
            # 1. AI content
            ai_data = await groq_client.generate_email_content({
                "business_name": lead.business_name,
                "category": lead.category,
                "location": lead.city,
                "rating": lead.rating,
                "review_count": lead.review_count,
                "web_presence_notes": lead.web_presence_notes
            })
            
            # 2. PDF Proposal
            pdf_path = generate_proposal_pdf(
                business_name=lead.business_name,
                category=lead.category,
                benefits=ai_data.get('benefits', []),
                output_filename=f"Proposal_{lead.id}.pdf"
            )
            
            # 3. Create Outreach Queue Record
            tracking_token = _generate_tracking_token(lead.id, campaign.id)
            html_body = render_email_html(
                {"business_name": lead.business_name}, 
                ai_data.get('body_html', ''), 
                tracking_token, 
                settings.APP_URL
            )
            
            outreach = EmailOutreach(
                lead_id=lead.id,
                campaign_id=campaign.id,
                to_email=lead.email,
                subject=ai_data.get('subject', f"Digital Growth for {lead.business_name}"),
                body_html=html_body,
                tracking_token=tracking_token,
                ai_generated=True,
                has_attachment=bool(pdf_path),
                attachment_names=[pdf_path] if pdf_path else [],
                status="queued"
            )
            db.add(outreach)
            
            campaign.total_leads += 1
            lead.status = "queued_for_send"
            pers_count += 1
            
        if leads:
            await db.commit()
            if pers_count > 0:
                await send_telegram_alert(f"Personalization phase completed. Queued {pers_count} customized proposals for automated dispatch.")


async def run_outreach_stage():
    """
    Executes the outreach phase of the lead generation pipeline.
    Dispatches queued emails sequentially.
    """
    logger.info("Starting Outreach Dispatch")
    
    if not is_pipeline_active():
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. Skipping outreach stage.")
        return
        
    sent_count = 0
    
    async with get_session_maker()() as db:
        stmt = select(EmailOutreach).where(EmailOutreach.status == "queued")
        result = await db.execute(stmt)
        queued_emails = result.scalars().all()
        
        for email_task in queued_emails:
            attachments = email_task.attachment_names if email_task.has_attachment else []
            success = await send_email(
                to_email=email_task.to_email,
                subject=email_task.subject,
                html_content=email_task.body_html,
                attachment_paths=attachments
            )
            
            if success:
                email_task.status = "sent"
                email_task.sent_at = datetime.utcnow()
                sent_count += 1
                
                # Update lead
                l_stmt = select(Lead).where(Lead.id == email_task.lead_id)
                l_res = await db.execute(l_stmt)
                lead = l_res.scalars().first()
                if lead:
                    lead.status = "email_sent"
                    lead.email_sent_at = datetime.utcnow()
                    
                # Update Campaign
                c_stmt = select(Campaign).where(Campaign.id == email_task.campaign_id)
                c_res = await db.execute(c_stmt)
                campaign = c_res.scalars().first()
                if campaign:
                    campaign.emails_sent += 1
                    if campaign.status == "pending":
                        campaign.status = "active"
                        campaign.started_at = datetime.utcnow()
                
                # Commit immediately per successful email to prevent batch rollback
                await db.commit()
                    
                # Clean up PDF if needed
                for att in attachments:
                    if os.path.exists(att):
                        os.remove(att)
            else:
                email_task.status = "failed"
                
            # Slow down to avoid spam filters (optional if running synchronously)
            await asyncio.sleep(2)
            
        if queued_emails:
            await db.commit()
            if sent_count > 0:
                await send_telegram_alert(f"Outreach phase completed. Successfully dispatched {sent_count} communications.")


async def poll_replies():
    """
    Monitors the reply inbox via IMAP and updates lead status on replies.
    """
    logger.info("Polling for replies")
    
    if not is_pipeline_active():
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. Skipping reply polling.")
        return
        
    replies = await fetch_recent_replies(since_minutes=30)
    
    async with get_session_maker()() as db:
        for sender_email, subject, reply_time in replies:
            if not sender_email:
                continue
                
            # Find matching lead
            stmt = select(Lead).where(Lead.email == sender_email).order_by(Lead.created_at.desc()).limit(1)
            res = await db.execute(stmt)
            lead = res.scalars().first()
            
            if lead and lead.status != "replied":
                try:
                    lead.status = "replied"
                    lead.first_replied_at = reply_time
                    
                    # Update associate Campaign metric
                    outreach_stmt = select(EmailOutreach).where(EmailOutreach.lead_id == lead.id).order_by(EmailOutreach.created_at.desc()).limit(1)
                    outreach_res = await db.execute(outreach_stmt)
                    outreach = outreach_res.scalars().first()
                    if outreach:
                        if outreach.status != "replied":
                            outreach.status = "replied"
                            
                        camp_stmt = select(Campaign).where(Campaign.id == outreach.campaign_id)
                        camp_res = await db.execute(camp_stmt)
                        campaign = camp_res.scalars().first()
                        if campaign:
                            campaign.replies_received += 1
                    
                    await db.commit()
                    await send_telegram_alert(f"Reply Detected.\nLead: {lead.business_name}\nEmail: {lead.email}\nSubject Reference: {subject}")
                except Exception as e:
                    await db.rollback()
                    logger.error(f"Error processing reply sync for {sender_email}: {e}")


async def generate_daily_report():
    """
    Generates the daily analytical report and dispatches it to admins.
    """
    logger.info("Generating Daily Report")
    
    if not is_pipeline_active():
        logger.warning("🚨 PRODUCTION_STATUS is HOLD. Skipping daily report generation.")
        return
        
    today = date.today()
    
    async with get_session_maker()() as db:
        camp_stmt = select(Campaign).where(Campaign.campaign_date == today).limit(1)
        camp_res = await db.execute(camp_stmt)
        campaign = camp_res.scalars().first()
        
        if not campaign:
            return # Nothing happened today
            
        report_data = {
            "leads_discovered": await db.scalar(select(func.count(Lead.id)).where(func.date(Lead.discovered_at) == today)),
            "leads_qualified": await db.scalar(select(func.count(Lead.id)).where(func.date(Lead.qualified_at) == today)),
            "emails_sent": await db.scalar(select(func.count(EmailOutreach.id)).where(func.date(EmailOutreach.sent_at) == today)),
            "emails_opened": await db.scalar(select(func.count(EmailEvent.id)).where((func.date(EmailEvent.occurred_at) == today) & (EmailEvent.event_type == 'open'))),
            "links_clicked": await db.scalar(select(func.count(EmailEvent.id)).where((func.date(EmailEvent.occurred_at) == today) & (EmailEvent.event_type == 'click'))),
            "replies_received": await db.scalar(select(func.count(Lead.id)).where(func.date(Lead.first_replied_at) == today))
        }
        
        # Save to DB report
        report_stmt = select(DailyReport).where(DailyReport.report_date == today)
        report_res = await db.execute(report_stmt)
        db_report = report_res.scalars().first()
        
        if db_report:
            db_report.leads_discovered = report_data["leads_discovered"]
            db_report.leads_qualified = report_data["leads_qualified"]
            db_report.emails_sent = report_data["emails_sent"]
            db_report.emails_opened = report_data["emails_opened"]
            db_report.links_clicked = report_data["links_clicked"]
            db_report.replies_received = report_data["replies_received"]
        else:
            db_report = DailyReport(
                report_date=today,
                leads_discovered=report_data["leads_discovered"],
                leads_qualified=report_data["leads_qualified"],
                emails_sent=report_data["emails_sent"],
                emails_opened=report_data["emails_opened"],
                links_clicked=report_data["links_clicked"],
                replies_received=report_data["replies_received"]
            )
            db.add(db_report)
        
        # Get active leads for excel
        leads_stmt = select(Lead).where(
            (func.date(Lead.discovered_at) == today) | 
            (Lead.status.in_(["email_sent", "opened", "clicked", "replied"]))
        )
        leads_res = await db.execute(leads_stmt)
        leads = leads_res.scalars().all()
        
        lead_dicts = [{
            "business_name": l.business_name,
            "category": l.category,
            "city": l.city,
            "email_sent_at": l.email_sent_at,
            "first_opened_at": l.first_opened_at,
            "first_clicked_at": l.first_clicked_at,
            "first_replied_at": l.first_replied_at,
            "status": l.status,
            "phone": l.phone,
            "google_maps_url": l.google_maps_url
        } for l in leads]
        
        excel_path = generate_daily_report_excel(report_data, lead_dicts, today)
        
        await send_daily_report_email(report_data, excel_path, today)
        await db.commit()

# ============================================================
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
# @celery_app.task(name="app.tasks.daily_pipeline.run_qualification_task")
# def run_qualification_task():
#     ... (repeat pattern for each stage below)
#
# @celery_app.task(name="app.tasks.daily_pipeline.run_manual_full_pipeline")
# def run_manual_full_pipeline():
#     logger.info("Running full manual pipeline...")
#     try:
#         run_async(run_discovery_stage())
#         run_async(run_qualification_stage())
#         run_async(run_personalization_stage())
#         run_async(run_outreach_stage())
#         run_async(generate_daily_report())
#     except Exception as e:
#         logger.error(f"Manual Pipeline Failed: {e}")
#         run_async(send_telegram_alert(f"Pipeline Error (Manual Run): {e}"))
# ============================================================
