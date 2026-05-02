"""
Single-lead WhatsApp personalization runner.

Mirror of ``run_single_lead_outreach`` for phone-qualified leads. The
WhatsApp button on the Leads CRM kicks this stage to:

1. Run the same enrichment / competitor / website-content pull the email
   personalization stage uses, so the WhatsApp message references the
   same real signals the email path would.
2. Optionally generate a one-off demo site for no-website leads (gated by
   ``DEMO_GENERATION_ENABLED``).
3. Ask Groq for a short, conversational WhatsApp body.
4. Cache the result in Redis for 24h so subsequent clicks of the WhatsApp
   button reuse the same message instead of paying Groq again.

Crucially, this runner does NOT change the lead's status. WhatsApp delivery
happens client-side (the freelancer presses Send inside WhatsApp), and we
have no automated way to confirm it. The lead stays at ``phone_qualified``
so the button keeps working — same UX guarantee as today, just with a
personalized body and a properly-formatted phone number.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from loguru import logger
from sqlalchemy import select

from app.config import get_settings
from app.core.database import get_session_maker
from app.core.phone_utils import normalize_for_whatsapp
from app.core.redis_client import get_redis
from app.models.lead import Lead
from app.modules.demo_builder.generator import generate_demo_for_lead
from app.modules.personalization.groq_client import GroqClient

settings = get_settings()


_CACHE_PREFIX = "whatsapp_msg:lead"
_CACHE_TTL_SECONDS = 60 * 60 * 24  # 24h — long enough to retry, short enough that profile changes propagate.


class WhatsAppOutreachError(RuntimeError):
    """Raised when a WhatsApp outreach cannot be built (no phone, etc.)."""


async def _cache_get(lead_id: str) -> Optional[dict]:
    try:
        r = get_redis()
    except Exception:
        return None
    try:
        raw = await r.get(f"{_CACHE_PREFIX}:{lead_id}")
    except Exception as e:
        logger.warning(f"WhatsApp cache get failed for {lead_id}: {e}")
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def _cache_set(lead_id: str, payload: dict) -> None:
    try:
        r = get_redis()
    except Exception:
        return
    try:
        await r.set(
            f"{_CACHE_PREFIX}:{lead_id}",
            json.dumps(payload),
            ex=_CACHE_TTL_SECONDS,
        )
    except Exception as e:
        logger.warning(f"WhatsApp cache set failed for {lead_id}: {e}")


async def _cache_clear(lead_id: str) -> None:
    try:
        r = get_redis()
    except Exception:
        return
    try:
        await r.delete(f"{_CACHE_PREFIX}:{lead_id}")
    except Exception:
        pass


async def build_whatsapp_outreach(
    *,
    lead_id: str | UUID,
    user_id: Optional[int],
    sender_name: Optional[str],
    force_regenerate: bool = False,
) -> dict:
    """Run personalization for one phone-qualified lead and return a wa.me payload.

    Returns a dict with:
        url            : str — wa.me link with the prefilled message
        message        : str — personalized message body
        phone_digits   : str — normalized E.164 digits (no plus)
        cached         : bool — True when we returned a cached message
        generated_at   : ISO 8601 UTC timestamp

    Raises ``WhatsAppOutreachError`` for predictable failure modes
    (lead missing, no phone, phone too short to normalize). All other
    exceptions bubble up so the API layer can surface a 500.
    """
    lead_id_str = str(lead_id)

    if not force_regenerate:
        cached = await _cache_get(lead_id_str)
        if cached and cached.get("message") and cached.get("phone_digits"):
            from urllib.parse import quote
            return {
                "url": f"https://wa.me/{cached['phone_digits']}?text={quote(cached['message'], safe='')}",
                "message": cached["message"],
                "phone_digits": cached["phone_digits"],
                "cached": True,
                "generated_at": cached.get("generated_at")
                                or datetime.now(timezone.utc).isoformat(),
            }

    session_maker = get_session_maker()
    async with session_maker() as db:
        lead_query = select(Lead).where(Lead.id == lead_id_str)
        if user_id is not None:
            lead_query = lead_query.where(Lead.user_id == user_id)
        lead = (await db.execute(lead_query)).scalars().first()

        if lead is None:
            raise WhatsAppOutreachError("Lead not found or not owned by this user")
        if not lead.phone:
            raise WhatsAppOutreachError("Lead has no phone number on file.")

        digits = normalize_for_whatsapp(lead.phone, lead.country_code)
        if not digits:
            raise WhatsAppOutreachError(
                "Lead's phone number couldn't be normalized to a wa.me-compatible "
                "format. Check the country code and the number itself."
            )

        # Best-effort enrichment — never block message generation on it.
        website_content: dict = {}
        if lead.website_url and lead.has_website:
            try:
                from app.modules.enrichment.website_content_extractor import (
                    extract_website_content,
                )
                website_content = await extract_website_content(lead.website_url)
            except Exception as enrich_err:
                logger.warning(
                    f"Website enrichment failed for lead {lead_id_str}, continuing: {enrich_err}"
                )

        # Demo site generation for no-website leads — same gate as the email path.
        demo_url: Optional[str] = None
        if not lead.has_website and settings.DEMO_GENERATION_ENABLED:
            try:
                if lead.demo_site_status != "generated":
                    await generate_demo_for_lead(lead)
                if lead.demo_site_status == "generated" and getattr(settings, "FRONTEND_DOMAIN", None):
                    demo_url = f"{settings.FRONTEND_DOMAIN}/demo/{lead.id}"
            except Exception as demo_err:
                logger.warning(
                    f"Demo generation failed for lead {lead_id_str} during WhatsApp run: {demo_err}"
                )

        groq_client = GroqClient()
        ai_data = await groq_client.generate_whatsapp_message(
            {
                "business_name": lead.business_name,
                "category": lead.category,
                "city": lead.city,
                "region": lead.region,
                "country": lead.country,
                "sub_area": lead.sub_area,
                "rating": lead.rating,
                "review_count": lead.review_count,
                "qualification_notes": lead.qualification_notes,
                "website_title": website_content.get("page_title"),
            },
            sender_name=sender_name,
            demo_url=demo_url,
        )
        message = (ai_data.get("message") or "").strip()
        if not message:
            raise WhatsAppOutreachError("Failed to generate WhatsApp message body.")

        # Persist enrichment side-effects (mirror the email pipeline).
        if website_content:
            lead.website_title = website_content.get("page_title")
            lead.website_copyright_year = website_content.get("copyright_year")
            lead.is_mobile_responsive = website_content.get("is_mobile_responsive")
            lead.has_online_booking = website_content.get("has_online_booking")
            lead.has_ecommerce = website_content.get("has_ecommerce")
            try:
                await db.commit()
            except Exception:
                await db.rollback()

    generated_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "message": message,
        "phone_digits": digits,
        "generated_at": generated_at,
    }
    await _cache_set(lead_id_str, payload)

    from urllib.parse import quote
    return {
        "url": f"https://wa.me/{digits}?text={quote(message, safe='')}",
        "message": message,
        "phone_digits": digits,
        "cached": False,
        "generated_at": generated_at,
    }


async def invalidate_cache(lead_id: str | UUID) -> None:
    """Drop the cached WhatsApp body so the next click re-runs Groq."""
    await _cache_clear(str(lead_id))
