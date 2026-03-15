"""
Unsubscribe handling API endpoint.
Processes one-click opt-out requests embedded in outreach emails, ensuring
CAN-SPAM / GDPR compliance by permanently disabling further communications
for the associated lead.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import base64
import json
import logging

from app.core.database import get_db
from app.models.campaign import EmailOutreach
from app.models.lead import Lead

router = APIRouter(prefix="/unsubscribe", tags=["unsubscribe"])
logger = logging.getLogger(__name__)

@router.get("/{tracking_token}", response_class=HTMLResponse)
async def unsubscribe_lead(tracking_token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Handles unsubscribe requests via the unique tracking token.
    Updates the lead status to 'unsubscribed' and disables follow-ups.
    """
    try:
        # Decode token to get lead_id
        decoded_bytes = base64.urlsafe_b64decode(tracking_token + '==')
        decoded_str = decoded_bytes.decode('utf-8')
        token_data = json.loads(decoded_str)
        
        lead_id = token_data.get("l")
        if not lead_id:
            raise ValueError("Invalid token format")
            
        stmt = select(Lead).where(Lead.id == lead_id)
        result = await db.execute(stmt)
        lead = result.scalars().first()
        
        if lead:
            lead.status = "unsubscribed"
            lead.followup_sequence_active = False
            await db.commit()
            
            return """
            <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h2>Unsubscribed Successfully</h2>
                    <p>You have been removed from our mailing list and will not receive further communications.</p>
                </body>
            </html>
            """
        else:
            return HTMLResponse(content="<h2>Link Expired or Invalid</h2>", status_code=400)
            
    except Exception as e:
        logger.error(f"Error processing unsubscribe for token {tracking_token}: {e}")
        return HTMLResponse(content="<h2>Invalid Unsubscribe Link</h2>", status_code=400)
