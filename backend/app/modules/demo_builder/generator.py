"""
Demo Website Generation Orchestrator.

Coordinates the two-stage AI pipeline for generating interactive landing pages:
  Stage A: Groq extracts a brand blueprint from lead data.
  Stage B: Gemini generates a complete HTML landing page from the blueprint.

CRITICAL DESIGN PRINCIPLE:
  This module is a pure additive enhancement. If ANY step fails, it catches
  the exception, marks the demo as "failed", and returns gracefully.
  It NEVER raises exceptions to its caller. The existing email pipeline
  must continue unaffected regardless of demo generation outcome.

Security:
  - Generated HTML is validated for basic structure.
  - Inline <script> tags (other than allowed CDN sources) are stripped.
  - Output size is capped at 500KB to prevent database bloat.
"""

import re
from datetime import datetime, timezone
from loguru import logger

from app.config import get_settings
from app.modules.demo_builder.brand_extractor import extract_brand_blueprint
from app.modules.demo_builder.gemini_client import generate_landing_page_html

settings = get_settings()

# Maximum HTML size stored in database (500KB)
_MAX_HTML_SIZE = 512_000

# Allowed CDN script sources — any other <script> tags are stripped
_ALLOWED_SCRIPT_PATTERNS = [
    r'cdn\.tailwindcss\.com',
    r'cdn\.jsdelivr\.net/npm/alpinejs',
    r'cdnjs\.cloudflare\.com',
    r'unpkg\.com',
    r'fonts\.googleapis\.com',
    r'fonts\.gstatic\.com',
    r'placehold\.co',
]


def _validate_html(html: str) -> bool:
    """
    Performs basic structural validation on generated HTML.

    Checks:
      - Starts with <!DOCTYPE html> (case-insensitive)
      - Contains <html>, <head>, <body>, </html> tags
      - Is within size limits
    """
    if not html or len(html) < 200:
        logger.warning("Generated HTML is too short or empty")
        return False

    if len(html) > _MAX_HTML_SIZE:
        logger.warning(f"Generated HTML exceeds size limit: {len(html)} > {_MAX_HTML_SIZE}")
        return False

    lower = html.lower().strip()
    if not lower.startswith("<!doctype html"):
        logger.warning("Generated HTML does not start with <!DOCTYPE html>")
        return False

    required_tags = ["<html", "<head", "<body", "</html>"]
    for tag in required_tags:
        if tag not in lower:
            logger.warning(f"Generated HTML missing required tag: {tag}")
            return False

    return True


def _sanitize_html(html: str) -> str:
    """
    Strips unauthorized inline <script> tags while preserving allowed CDN sources.

    Allowed sources: Tailwind CDN, Alpine.js CDN, CDNJS, Google Fonts, Unpkg.
    All other <script>...</script> blocks and inline event handlers in <script>
    tags are removed.
    """
    # Build combined pattern for allowed sources
    allowed_pattern = "|".join(_ALLOWED_SCRIPT_PATTERNS)

    def _filter_script(match):
        """Keep script tags that reference allowed CDNs, strip everything else."""
        tag_content = match.group(0)
        if re.search(allowed_pattern, tag_content):
            return tag_content
        # Check if it's a Tailwind config block (inline tailwind.config)
        if "tailwind" in tag_content.lower() and "config" in tag_content.lower():
            return tag_content
        # Check if it's Alpine.js inline data (x-data patterns)
        if "alpine" in tag_content.lower():
            return tag_content
        logger.debug(f"Stripped unauthorized script tag: {tag_content[:100]}...")
        return ""

    # Match all <script ...>...</script> and self-closing <script .../> tags
    sanitized = re.sub(
        r'<script[^>]*>.*?</script>|<script[^>]*/\s*>',
        _filter_script,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )

    return sanitized


async def generate_demo_for_lead(lead) -> bool:
    """
    Generates a demo landing page for a single lead.

    This is the main entry point called from the personalization pipeline.
    It NEVER raises exceptions — all errors are caught and logged.

    Args:
        lead: SQLAlchemy Lead model instance (must have has_website == False).

    Returns:
        bool: True if demo was successfully generated, False otherwise.
    """
    try:
        # Guard: only generate for no-website leads
        if lead.has_website:
            lead.demo_site_status = "not_applicable"
            return False

        # Guard: don't regenerate if already done
        if lead.demo_site_status == "generated":
            logger.info(f"Demo already generated for lead {lead.id}, skipping")
            return True

        # Guard: check kill switch
        if not settings.DEMO_GENERATION_ENABLED:
            logger.debug("Demo generation disabled via DEMO_GENERATION_ENABLED")
            return False

        # Guard: check API key
        if not settings.GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not configured — skipping demo generation")
            lead.demo_site_status = "failed"
            return False

        lead.demo_site_status = "generating"
        logger.info(
            f"Starting demo generation for lead {lead.id} "
            f"({lead.business_name}, {lead.category})"
        )

        # Stage A: Extract brand blueprint via Groq
        lead_data = {
            "business_name": lead.business_name,
            "category": lead.category,
            "city": lead.city,
            "region": lead.region,
            "country": lead.country,
            "phone": lead.phone,
            "address": lead.address,
            "rating": lead.rating,
            "review_count": lead.review_count,
            "raw_places_data": lead.raw_places_data,
        }

        blueprint = await extract_brand_blueprint(lead_data)
        if not blueprint:
            logger.error(f"Brand blueprint extraction failed for lead {lead.id}")
            lead.demo_site_status = "failed"
            return False

        # Stage B: Generate HTML via Gemini
        raw_html = await generate_landing_page_html(blueprint)
        if not raw_html:
            logger.error(f"Gemini HTML generation returned None for lead {lead.id}")
            lead.demo_site_status = "failed"
            return False

        # Validate structure
        if not _validate_html(raw_html):
            logger.error(f"Generated HTML failed validation for lead {lead.id}")
            lead.demo_site_status = "failed"
            return False

        # Sanitize unauthorized scripts
        sanitized_html = _sanitize_html(raw_html)

        # Truncate if still over limit after sanitization
        if len(sanitized_html) > _MAX_HTML_SIZE:
            logger.warning(f"Truncating HTML for lead {lead.id} from {len(sanitized_html)} to {_MAX_HTML_SIZE}")
            sanitized_html = sanitized_html[:_MAX_HTML_SIZE]

        # Store result
        lead.generated_demo_html = sanitized_html
        lead.demo_site_status = "generated"
        lead.demo_generated_at = datetime.now(timezone.utc)

        logger.info(
            f"Demo generated successfully for lead {lead.id} "
            f"({lead.business_name}): {len(sanitized_html)} bytes"
        )
        return True

    except Exception as e:
        # CRITICAL: Never propagate exceptions — the email pipeline must continue
        logger.error(
            f"Demo generation failed for lead {lead.id} "
            f"({getattr(lead, 'business_name', 'unknown')}): {e}"
        )
        try:
            lead.demo_site_status = "failed"
        except Exception:
            pass  # Even status update failure shouldn't propagate
        return False
