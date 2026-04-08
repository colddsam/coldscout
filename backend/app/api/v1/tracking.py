"""
Engagement tracking API endpoints.
Provides routes to process email pixel loads and link clicks.
"""
from fastapi import APIRouter, Request, Depends, Response
from fastapi.responses import RedirectResponse
from urllib.parse import urlparse
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

# Domain whitelist for tracking redirects — even with valid HMAC tokens,
# redirects are restricted to known-safe destinations to prevent abuse
# if a token is leaked or reused in a phishing context.
_BUILTIN_DOMAINS = frozenset({
    # Scheduling / booking
    "calendly.com", "cal.com", "savvycal.com", "tidycal.com",
    "hubspot.com", "acuityscheduling.com", "zcal.co",
    # Social / professional
    "linkedin.com", "github.com", "twitter.com", "x.com",
    "dribbble.com", "behance.net", "facebook.com", "instagram.com",
    # Google / business
    "google.com", "maps.google.com", "workspace.google.com",
    # Common business / SaaS
    "notion.so", "figma.com", "canva.com", "loom.com",
    "zoom.us", "teams.microsoft.com", "meet.google.com",
})


def _get_redirect_whitelist() -> frozenset[str]:
    """Merge built-in domains, app domains, and user-configured REDIRECT_DOMAIN_WHITELIST."""
    # Start with built-ins
    whitelist = set(_BUILTIN_DOMAINS)
    
    # Add app's own domains
    for url_str in [settings.APP_URL, settings.FRONTEND_DOMAIN]:
        if url_str:
            try:
                parsed = urlparse(url_str)
                if parsed.netloc:
                    whitelist.add(parsed.netloc.lower().split(":")[0])
            except Exception:
                pass
                
    # Add custom overrides
    extra = settings.REDIRECT_DOMAIN_WHITELIST.strip()
    if extra:
        for d in extra.split(","):
            if d.strip():
                whitelist.add(d.strip().lower())
                
    return frozenset(whitelist)


def _is_whitelisted_redirect(url: str) -> bool:
    """Check if a URL's domain is in the redirect whitelist."""
    if url.startswith("mailto:"):
        return True
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            # For safety, we only allow absolute URLs for external redirects
            return False
        # Only allow http/https schemes
        if parsed.scheme not in ("http", "https"):
            return False
        domain = parsed.netloc.lower().split(":")[0]  # strip port
        whitelist = _get_redirect_whitelist()
        # Check exact match or subdomain match (e.g., www.calendly.com)
        return any(
            domain == allowed or domain.endswith(f".{allowed}")
            for allowed in whitelist
        )
    except Exception:
        return False

def _verify_tracking_token(token: str) -> bool:
    """
    Verifies the HMAC signature of a tracking token.
    Uses dynamic padding to ensure robust Base64 decoding.
    """
    try:
        if "." not in token:
            return False
        b64_payload, b64_sig = token.split(".", 1)
        
        # Add padding back helper
        def add_padding(s: str) -> str:
            mod = len(s) % 4
            return s + "=" * (4 - mod) if mod else s

        payload_bytes = base64.urlsafe_b64decode(add_padding(b64_payload))
        payload_str = payload_bytes.decode("utf-8")
        
        expected_sig = hmac.new(
            settings.SECURITY_SALT.encode(),
            payload_str.encode(),
            hashlib.sha256
        ).digest()
        
        actual_sig = base64.urlsafe_b64decode(add_padding(b64_sig))
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
    # Always enforce domain whitelist — even valid tokens should only redirect
    # to known-safe destinations. This defends against phishing if a tracking
    # URL is forwarded or a token is leaked.
    if not _is_whitelisted_redirect(url):
        logger.warning(f"Blocked redirect to non-whitelisted domain: {url}")
        # Default to a safe destination (the app's own homepage)
        return RedirectResponse(url=settings.APP_URL or "/")

    if _verify_tracking_token(token):
        await TrackingService.log_event(db, token, "click", request, url_clicked=url)

    return RedirectResponse(url=url)
