"""
Automated follow-up orchestration module.
Manages the lifecycle, scheduling, and dynamic content generation for multi-touchpoint 
email sequences targeting unresponsive leads.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.models.lead import Lead
from app.models.campaign import Campaign, EmailOutreach
from app.modules.personalization.groq_client import GroqClient
from app.modules.personalization.email_generator import render_email_html
from app.modules.personalization.booking_utils import get_resolved_booking_url
from app.modules.outreach.email_sender import send_email
from app.config import get_settings

settings = get_settings()

FOLLOWUP_SCHEDULE = [
    {"days_after": 3,  "template_key": "followup_1"},   # Brief check-in, different angle
    {"days_after": 7,  "template_key": "followup_2"},   # Value-add: share a stat or tip
    {"days_after": 14, "template_key": "followup_3"},   # Final "break-up" email
]

async def schedule_followup(lead: Lead, db: AsyncSession):
    """
    Initializes the follow-up sequence for a lead upon successful transmission of the 
    initial outreach email.
    """
    # Schedule for 3 days from now, normalized to start of day (00:00 UTC)
    # to ensure it's picked up by the next available morning cron window.
    lead.next_followup_at = (datetime.now(timezone.utc) + timedelta(days=3)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    lead.followup_sequence_active = True

async def cancel_followup_sequence(lead_id: UUID, db: AsyncSession):
    """
    Terminates the active follow-up sequence. Invoked asynchronously via webhooks 
    when an engagement event (reply, click) is detected.
    """
    stmt = select(Lead).where(Lead.id == lead_id)
    res = await db.execute(stmt)
    lead = res.scalars().first()
    if lead:
        lead.followup_sequence_active = False
        await db.commit()

async def run_followup_dispatch(manual: bool = False, user_id: int | None = None):
    """
    Cron-triggered dispatcher. Scans for due follow-ups for a specific
    freelancer, queries the LLM for contextual sequence progression strings,
    dispatches the SMTP transport, and updates sequence metadata.

    Multi-tenant: ``user_id`` scopes every read/write to that freelancer's
    leads and campaigns so one tenant's follow-ups never affect another.
    """
    from app.core.database import get_session_maker
    from app.tasks.daily_pipeline import _generate_tracking_token
    from app.core.job_manager import job_manager
    from app.modules.notifications.telegram_bot import send_telegram_alert

    logger.info(f"Starting Follow-Up Engine (user_id={user_id})")

    if not await job_manager.is_freelancer_pipeline_active(
        "followup_dispatch", user_id=user_id, is_manual=manual
    ):
        logger.warning(f"🚨 [followup_dispatch] blocked for user {user_id}. Skipping follow-up.")
        return

    groq_client = GroqClient()
    sent_count = 0
    now = datetime.now(timezone.utc)

    async with get_session_maker()() as db:
        from datetime import date
        today = date.today()
        camp_stmt = select(Campaign).where(Campaign.campaign_date == today)
        if user_id is not None:
            camp_stmt = camp_stmt.where(Campaign.user_id == user_id)
        camp_stmt = camp_stmt.limit(1)
        camp_res = await db.execute(camp_stmt)
        campaign = camp_res.scalars().first()

        if not campaign:
            campaign = Campaign(name=f"Daily Outreach {today}", campaign_date=today, user_id=user_id)
            db.add(campaign)
            await db.flush()

        # Resolve the booking URL once per batch (system-wide or admin-specific)
        resolved_booking_url = await get_resolved_booking_url(db)

        stmt = select(Lead).where(
            Lead.status.in_(["email_sent", "opened"]),
            Lead.followup_sequence_active == True,
            Lead.next_followup_at <= now,
            Lead.followup_count < 3
        )
        if user_id is not None:
            stmt = stmt.where(Lead.user_id == user_id)
        res = await db.execute(stmt)
        leads = res.scalars().all()
        
        for lead in leads:
            try:
                next_count = (lead.followup_count or 0) + 1
                lead_data = {
                    "business_name": lead.business_name,
                    "category": lead.category,
                    "location": lead.city,
                    "rating": lead.rating,
                    "review_count": lead.review_count,
                    "qualification_notes": lead.qualification_notes
                }
                
                ai_data = await groq_client.generate_followup_email(lead_data, next_count)
                
                tracking_token = _generate_tracking_token(lead.id, campaign.id)
                html_body = render_email_html(
                    {"business_name": lead.business_name},
                    ai_data.get('body_html', ''),
                    tracking_token,
                    settings.APP_URL,
                    booking_url=resolved_booking_url,
                )
                
                subject = ai_data.get('subject', f"Following up: {lead.business_name}")
                
                success = await send_email(
                    to_email=lead.email,
                    subject=subject,
                    html_content=html_body,
                    attachment_paths=[]
                )
                
                # Retry up to 2 more times on transient failures
                MAX_RETRIES = 3
                for attempt in range(1, MAX_RETRIES + 1):
                    if success:
                        break
                    if attempt > 1:
                        logger.warning(f"Retry {attempt}/{MAX_RETRIES} for follow-up to {lead.email}")
                        await asyncio.sleep(3 * attempt)  # Exponential backoff
                        success = await send_email(
                            to_email=lead.email,
                            subject=subject,
                            html_content=html_body,
                            attachment_paths=[]
                        )

                if success:
                    outreach = EmailOutreach(
                        lead_id=lead.id,
                        campaign_id=campaign.id,
                        to_email=lead.email,
                        subject=subject,
                        body_html=html_body,
                        tracking_token=tracking_token,
                        ai_generated=True,
                        has_attachment=False,
                        attachment_names=[],
                        status="sent",
                        sent_at=now
                    )
                    db.add(outreach)

                    lead.followup_count = next_count
                    if next_count >= 3:
                        lead.followup_sequence_active = False
                    else:
                        next_interval = FOLLOWUP_SCHEDULE[next_count]["days_after"] - FOLLOWUP_SCHEDULE[next_count-1]["days_after"]
                        # Normalize to start of day for consistent daily dispatch
                        lead.next_followup_at = (now + timedelta(days=next_interval)).replace(
                            hour=0, minute=0, second=0, microsecond=0
                        )

                    campaign.emails_sent += 1
                    sent_count += 1
                    await db.commit()
                else:
                    logger.error(f"Failed to send follow-up to {lead.email} after {MAX_RETRIES} attempts")
                
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error in follow-up for lead {lead.id}: {e}")
                await db.rollback()
                
        if sent_count > 0:
            await send_telegram_alert(f"Follow-up phase completed. Dispatched {sent_count} follow-up communications.")
