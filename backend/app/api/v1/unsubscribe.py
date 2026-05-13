"""
Unsubscribe handling API endpoint.
Processes one-click opt-out requests embedded in outreach emails, ensuring
CAN-SPAM / GDPR compliance by permanently disabling further communications
for the associated lead.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import hmac
import hashlib
import base64
from app.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from loguru import logger
from app.models.lead import Lead

settings = get_settings()
router = APIRouter()

@router.get("/{tracking_token}", response_class=HTMLResponse)
@limiter.limit("60/minute")
async def unsubscribe_lead(
    request: Request,
    response: Response,
    tracking_token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Handles unsubscribe requests via the unique tracking token.
    Updates the lead status to 'unsubscribed' and disables follow-ups.
    Verifies HMAC signature to prevent IDOR attacks.
    """
    _ = response  # slowapi header injection
    try:
        if "." not in tracking_token:
            raise ValueError("Invalid token format")

        b64_payload, b64_sig = tracking_token.split(".", 1)

        def _add_padding(s: str) -> str:
            mod = len(s) % 4
            return s + "=" * (4 - mod) if mod else s

        payload_bytes = base64.urlsafe_b64decode(_add_padding(b64_payload))
        payload_str = payload_bytes.decode("utf-8")

        expected_sig = hmac.new(
            settings.SECURITY_SALT.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).digest()

        actual_sig = base64.urlsafe_b64decode(_add_padding(b64_sig))
        
        if not hmac.compare_digest(actual_sig, expected_sig):
            # Don't log the full token — it embeds the recipient's lead id
            # and is effectively unsubscribe credential material. A short
            # prefix is enough to correlate with operational alerts.
            logger.warning(
                f"Invalid signature attempt on unsubscribe (token prefix={tracking_token[:8]})"
            )
            return HTMLResponse(content="<h2>Invalid or Tampered Link</h2>", status_code=400)

        if "_" not in payload_str:
             raise ValueError("Malformed payload")

        # Token payload is ``"{lead_uuid}_{campaign_uuid}"`` per
        # ``daily_pipeline._generate_tracking_token``. The lead id is a
        # UUID string — passing it through ``int()`` (the original code)
        # raised ValueError on every call, so unsubscribe links had been
        # silently broken. We hand the UUID straight to SQLAlchemy which
        # coerces it via the column type.
        lead_id_str, _ = payload_str.split("_", 1)

        try:
            from uuid import UUID
            UUID(lead_id_str)  # validate format, reject garbage early
        except ValueError:
            raise ValueError("Malformed lead id in token")

        stmt = select(Lead).where(Lead.id == lead_id_str)
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
        logger.error(
            f"Error processing unsubscribe (token prefix={tracking_token[:8]}): {type(e).__name__}: {str(e)[:120]}"
        )
        return HTMLResponse(content="<h2>Invalid Unsubscribe Link</h2>", status_code=400)
