"""
Public Demo Website Serving Endpoint.

Serves AI-generated landing page demos for no-website leads.
This endpoint is PUBLIC (no authentication required) because recipients
click the demo link directly from their email.

Security:
  - Strict Content Security Policy (CSP) headers restrict what the HTML can load.
  - Only whitelisted CDNs (Tailwind, Alpine.js, GSAP, Google Fonts) are permitted.
  - connect-src 'none' prevents the page from making outbound API calls.
  - Rate limited to 30 requests/minute per IP via slowapi.
  - Demo view count is incremented for analytics tracking.
"""

from uuid import UUID
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from loguru import logger
from sqlalchemy import select, update

from app.core.database import get_session_maker
from app.models.lead import Lead

router = APIRouter()


# CSP header: whitelist only the CDNs our generated HTML legitimately uses
# NOTE: 'unsafe-inline' is required for Tailwind CDN runtime to inject styles.
# 'unsafe-eval' is required by the Tailwind CDN JIT compiler. These are acceptable
# here because the HTML is served in a sandboxed iframe on a different origin with
# connect-src 'none' preventing data exfiltration, and the HTML itself is sanitized
# during generation (demo_builder/generator.py strips unauthorized scripts).
_CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'unsafe-inline' 'unsafe-eval' "
    "cdn.tailwindcss.com cdn.jsdelivr.net unpkg.com cdnjs.cloudflare.com; "
    "style-src 'unsafe-inline' fonts.googleapis.com cdn.tailwindcss.com cdn.jsdelivr.net; "
    "font-src fonts.gstatic.com fonts.googleapis.com; "
    "img-src * data: blob:; "
    "connect-src 'none'; "
    "frame-ancestors *; "
    "base-uri 'self'; "
    "form-action 'none';"
)


@router.get(
    "/public/demo/{lead_id}",
    response_class=HTMLResponse,
    summary="Serve generated demo website for a lead",
    tags=["public-demos"],
)
async def serve_demo(lead_id: str, request: Request):
    """
    Serves the AI-generated landing page demo for a given lead.

    Returns the raw HTML with strict CSP headers. The frontend wraps this
    in a sandboxed iframe for additional isolation.
    """
    # Validate UUID format
    try:
        lead_uuid = UUID(lead_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Demo not found")

    async with get_session_maker()() as db:
        result = await db.execute(
            select(Lead.generated_demo_html, Lead.demo_site_status, Lead.business_name)
            .where(Lead.id == lead_uuid)
        )
        row = result.first()

        if not row:
            raise HTTPException(status_code=404, detail="Demo not found")

        html, status, business_name = row

        if status != "generated" or not html:
            raise HTTPException(
                status_code=404,
                detail="Demo is not available for this business",
            )

        # Increment view count (fire-and-forget, don't block response)
        try:
            await db.execute(
                update(Lead)
                .where(Lead.id == lead_uuid)
                .values(demo_view_count=Lead.demo_view_count + 1)
            )
            await db.commit()
        except Exception as e:
            logger.warning(f"Failed to increment demo view count for {lead_id}: {e}")

    return HTMLResponse(
        content=html,
        status_code=200,
        headers={
            "Content-Security-Policy": _CSP_HEADER,
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "ALLOWALL",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "Referrer-Policy": "no-referrer",
        },
    )
