"""
Email engagement tracking module.
Provides services to process and record interaction events (opens, clicks)
associated with dispatched outreach campaigns.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from fastapi import Request
import logging
from datetime import datetime

from app.models.email_event import EmailEvent
from app.models.campaign import EmailOutreach, Campaign
from app.models.lead import Lead

logger = logging.getLogger(__name__)

class TrackingService:
    """
    Service class responsible for handling inbound engagement tracking requests.
    Updates corresponding lead and outreach entities based on interaction metrics.
    """
    @staticmethod
    async def log_event(db: AsyncSession, token: str, event_type: str, request: Request, url_clicked: str = None) -> Lead:
        """
        Records a discrete interaction event against a specific outreach transmission.
        Updates the progressive state of the associated lead profile.
        
        Args:
            db (AsyncSession): The active asynchronous database session.
            token (str): The unique base64 tracking token extracted from the request.
            event_type (str): The classification of the event (e.g., 'open', 'click').
            request (Request): The raw FastAPI request object containing client metadata.
            url_clicked (str, optional): The specific target URL if the event was a click.
            
        Returns:
            Lead: The fully updated Lead entity associated with the event, or None if validation fails.
        """
        try:
            stmt = select(EmailOutreach).where(EmailOutreach.tracking_token == token)
            result = await db.execute(stmt)
            outreach = result.scalars().first()
            
            if not outreach:
                return None
                
            lead_stmt = select(Lead).where(Lead.id == outreach.lead_id)
            lead_result = await db.execute(lead_stmt)
            lead = lead_result.scalars().first()
            
            if not lead:
                return None
                
            client_ip = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "")
            
            event = EmailEvent(
                lead_id=outreach.lead_id,
                outreach_id=outreach.id,
                tracking_token=token,
                event_type=event_type,
                url_clicked=url_clicked,
                ip_address=client_ip,
                user_agent=user_agent
            )
            db.add(event)
            
            # Fetch Campaign to increment stats properly
            campaign_stmt = select(Campaign).where(Campaign.id == outreach.campaign_id)
            campaign_res = await db.execute(campaign_stmt)
            campaign = campaign_res.scalars().first()

            if event_type == "open":
                if not lead.first_opened_at:
                    lead.first_opened_at = datetime.utcnow()
                    if campaign:
                        campaign.emails_opened += 1
                
                if lead.status in ["email_sent", "queued_for_send", "delivered"]:
                    lead.status = "opened"
                
                if not outreach.delivered_at:
                    outreach.delivered_at = datetime.utcnow()
                
                # Cascade status upward to outreach level
                if outreach.status in ["sent", "queued", "delivered"]:
                    outreach.status = "opened"
            
            elif event_type == "click":
                if not lead.first_clicked_at:
                    lead.first_clicked_at = datetime.utcnow()
                    if campaign:
                        campaign.links_clicked += 1
                    
                    # Fire WhatsApp alert on first click
                    from app.modules.notifications.whatsapp_bot import send_whatsapp_alert
                    import asyncio
                    asyncio.create_task(send_whatsapp_alert(f"HOT LEAD ALERT 🔥\n{lead.business_name} just clicked your proposal link!"))
                    
                    from app.modules.outreach.followup_engine import cancel_followup_sequence
                    await cancel_followup_sequence(lead.id, db)
                        
                if not lead.first_opened_at:
                    lead.first_opened_at = datetime.utcnow()
                    if campaign:
                        campaign.emails_opened += 1
                    
                if lead.status in ["email_sent", "opened", "queued_for_send", "delivered"]:
                    lead.status = "clicked"
                    
                # Cascade status upward to outreach level
                if outreach.status in ["sent", "queued", "delivered", "opened"]:
                    outreach.status = "clicked"
                    
            await db.commit()
            return lead
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error logging {event_type} event: {e}")
            return None
