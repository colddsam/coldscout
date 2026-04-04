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
import hmac
import hashlib
import base64
from app.config import get_settings
from app.core.database import get_db
from loguru import logger
from app.models.lead import Lead

settings = get_settings()
router = APIRouter()

@router.get("/{tracking_token}", response_class=HTMLResponse)
async def unsubscribe_lead(tracking_token: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Handles unsubscribe requests via the unique tracking token.
    Updates the lead status to 'unsubscribed' and disables follow-ups.
    Verifies HMAC signature to prevent IDOR attacks.
    """
    try:
        if "." not in tracking_token:
            raise ValueError("Invalid token format")
            
        b64_payload, b64_sig = tracking_token.split(".", 1)
        
        payload_bytes = base64.urlsafe_b64decode(b64_payload + "===")
        payload_str = payload_bytes.decode("utf-8")
        
        expected_sig = hmac.new(
            settings.SECURITY_SALT.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).digest()
        
        actual_sig = base64.urlsafe_b64decode(b64_sig + "===")
        
        if not hmac.compare_digest(actual_sig, expected_sig):
            logger.warning(f"Invalid signature attempt for token: {tracking_token}")
            return HTMLResponse(content="<h2>Invalid or Tampered Link</h2>", status_code=400)

        if "_" not in payload_str:
             raise ValueError("Malformed payload")
             
        lead_id_str, _ = payload_str.split("_", 1)
        lead_id = int(lead_id_str)
            
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
