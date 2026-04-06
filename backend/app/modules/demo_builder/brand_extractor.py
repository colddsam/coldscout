"""
Brand Blueprint Extractor.

Analyzes raw Google Places data and lead context to produce a structured
JSON brand blueprint that guides Gemini's landing page generation.

Uses the existing Groq free tier (already integrated) for fast inference.
The blueprint enforces strict aesthetic parameters and explicitly bans
AI clichés (glassmorphism, neon glows, etc.).

Security notes:
  - All lead fields are sanitized via _sanitize_prompt_value before prompt
    substitution to prevent prompt injection from scraped data.
"""

import json
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential
from groq import AsyncGroq

from app.config import get_settings
from app.modules.personalization.groq_client import _sanitize_prompt_value

settings = get_settings()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def extract_brand_blueprint(lead_data: dict) -> dict | None:
    """
    Extracts a structured brand blueprint from lead context using Groq.

    Args:
        lead_data: Dictionary containing lead fields (business_name, category,
                   city, region, country, phone, address, rating, review_count,
                   raw_places_data, etc.).

    Returns:
        dict: Brand blueprint with colors, typography, tone, sections, etc.
              Returns None on failure.
    """
    # Sanitize all external inputs
    business_name = _sanitize_prompt_value(lead_data.get("business_name", "Local Business"))
    category = _sanitize_prompt_value(lead_data.get("category", "Business"))
    city = _sanitize_prompt_value(lead_data.get("city", ""))
    region = _sanitize_prompt_value(lead_data.get("region", ""))
    country = _sanitize_prompt_value(lead_data.get("country", ""))
    phone = _sanitize_prompt_value(lead_data.get("phone", ""))
    address = _sanitize_prompt_value(lead_data.get("address", ""))
    rating = lead_data.get("rating", 0)
    review_count = lead_data.get("review_count", 0)

    # Extract useful context from raw Places data
    raw_data = lead_data.get("raw_places_data") or {}
    opening_hours = ""
    if isinstance(raw_data, dict):
        hours_data = raw_data.get("regularOpeningHours", {})
        if isinstance(hours_data, dict):
            weekday_texts = hours_data.get("weekdayDescriptions", [])
            if weekday_texts:
                opening_hours = "; ".join(weekday_texts[:7])

    location_str = ", ".join(filter(None, [city, region, country]))

    prompt = f"""You are a brand identity expert. Analyze this local business and create a brand blueprint
for building them a premium landing page website.

BUSINESS CONTEXT:
- Name: {business_name}
- Category: {category}
- Location: {location_str}
- Address: {address}
- Phone: {phone}
- Google Rating: {rating} stars ({review_count} reviews)
- Opening Hours: {opening_hours or "Not available"}

INSTRUCTIONS:
1. Choose brand colors that are APPROPRIATE for this specific business category and location.
   - A dentist should feel clean and trustworthy (blues, whites)
   - A bakery should feel warm and inviting (warm tones, cream)
   - A gym should feel energetic and bold (dark with vibrant accents)
   - A law firm should feel professional and authoritative (navy, gold)
   - Adapt colors to regional/cultural expectations when relevant.

2. Choose a font style that matches the business personality.

3. Write a compelling tagline specific to this business.

4. Determine the overall tone (professional, casual, luxury, friendly, energetic).

5. List 4-6 service/feature items relevant to this business category.

STRICTLY BANNED in the design:
  - Glassmorphism, frosted glass, backdrop-blur
  - Neon glow effects or glowing shadows
  - Generic gradient backgrounds
  - Dark mode with neon accents
  - Any design that looks like a generic AI template

Return ONLY a valid JSON object:
{{
  "business_name": "{business_name}",
  "category": "{category}",
  "city": "{city}",
  "region": "{region}",
  "country": "{country}",
  "tagline": "A compelling tagline for this specific business",
  "primary_color": "#hex (dominant brand color)",
  "secondary_color": "#hex (background/complement)",
  "accent_color": "#hex (CTA buttons, highlights)",
  "font_style": "serif | sans-serif | slab",
  "tone": "professional | casual | luxury | friendly | energetic",
  "services": ["Service 1", "Service 2", "Service 3", "Service 4"],
  "phone": "{phone}",
  "address": "{address}",
  "rating": {rating or 0},
  "review_count": {review_count or 0},
  "opening_hours": "{opening_hours or 'Contact for hours'}"
}}"""

    try:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        chat_completion = await client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=settings.GROQ_MODEL,
            response_format={"type": "json_object"},
            temperature=0.6,
        )

        result = json.loads(chat_completion.choices[0].message.content)

        # Ensure required fields have fallback values
        result.setdefault("business_name", business_name)
        result.setdefault("category", category)
        result.setdefault("primary_color", "#1a1a1a")
        result.setdefault("secondary_color", "#f5f5f5")
        result.setdefault("accent_color", "#e63946")
        result.setdefault("font_style", "sans-serif")
        result.setdefault("tone", "professional")
        result.setdefault("services", [f"{category} Services"])
        result.setdefault("phone", phone)
        result.setdefault("address", address)
        result.setdefault("rating", rating)
        result.setdefault("review_count", review_count)

        logger.info(
            f"Brand blueprint extracted for '{business_name}': "
            f"colors={result['primary_color']}/{result['secondary_color']}/{result['accent_color']}, "
            f"tone={result['tone']}"
        )
        return result

    except Exception as e:
        logger.error(f"Brand blueprint extraction failed for '{business_name}': {e}")
        raise  # Let tenacity retry
