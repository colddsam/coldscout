"""
Engagement tracking API endpoints.
Provides routes to process email pixel loads and link clicks.
"""
from fastapi import APIRouter, Request, Depends, Response
from fastapi.responses import RedirectResponse
import base64
import hmac
import hashlib
from loguru import logger
from app.core.database import get_db
from app.modules.tracking.pixel_tracker import TrackingService
from app.config import get_settings

settings = get_settings()
router = APIRouter()

PIXEL_GIF = base64.b64decode("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==")

def _verify_tracking_token(token: str) -> bool:
    """
    Verifies the HMAC signature of a tracking token.
    """
    try:
        if "." not in token:
            return False
        b64_payload, b64_sig = token.split(".", 1)
        # Add padding back
        payload_bytes = base64.urlsafe_b64decode(b64_payload + "===")
        payload_str = payload_bytes.decode("utf-8")
        
        expected_sig = hmac.new(
            settings.SECURITY_SALT.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).digest()
        
        actual_sig = base64.urlsafe_b64decode(b64_sig + "===")
        return hmac.compare_digest(actual_sig, expected_sig)
    except Exception:
        return False

@router.get("/track/open/{token}")
async def track_email_open(token: str, request: Request, db=Depends(get_db)):
    """
    HTTP GET endpoint for the embedded 1x1 tracking pixel.
    Registers an 'open' event and returns a transparent GIF.
    Verifies signature to prevent spoofing.
    """
    if not _verify_tracking_token(token):
        return Response(content=PIXEL_GIF, media_type="image/gif")

    await TrackingService.log_event(db, token, "open", request)
    return Response(content=PIXEL_GIF, media_type="image/gif")

@router.get("/track/click/{token}")
async def track_email_click(token: str, url: str, request: Request, db=Depends(get_db)):
    """
    HTTP GET endpoint for wrapped hyperlink redirection.
    Registers a 'click' event before issuing an HTTP 307 Redirect.
    Includes security validation to prevent Open Redirect vulnerabilities and token spoofing.
    """
    # Security: Prevent Open Redirect to untrusted domains.
    # This check runs BEFORE token verification so that even a valid token
    # cannot be used to redirect users to a malicious external site.
    is_safe = (
        url.startswith("mailto:")
        or url.startswith(settings.APP_URL)
        or url.startswith(settings.FRONTEND_DOMAIN)
    )

    if not is_safe:
        logger.warning(f"Blocked potential Open Redirect attempt to: {url}")
        return RedirectResponse(url=settings.APP_URL)

    # Security: Verify token signature
    if not _verify_tracking_token(token):
        # Invalid signature — redirect to safe destination but don't log event
        return RedirectResponse(url=url)

    await TrackingService.log_event(db, token, "click", request, url_clicked=url)
    return RedirectResponse(url=url)
