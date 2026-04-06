"""
Gemini API Client for Interactive HTML Landing Page Generation.

Uses Google Gemini 2.5 Flash (free tier) to generate complete, self-contained
HTML landing pages from structured brand blueprints.

Free tier limits (as of 2026):
  - 15 requests per minute
  - 1,500 requests per day
  - 1,000,000 tokens per day

Security notes:
  - The brand blueprint is pre-sanitized by brand_extractor.py before reaching
    this module — no raw external data is passed directly to Gemini.
  - Generated HTML is post-validated before storage (see generator.py).
"""

import json
import asyncio
from datetime import date
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

settings = get_settings()

# Rate limiter: simple semaphore + delay to stay under 14 RPM
_GEMINI_SEMAPHORE = asyncio.Semaphore(1)
_MIN_REQUEST_INTERVAL = 5.0  # seconds between requests (≈12 RPM, safely under 15)

# Daily generation counter — resets on date change, enforces DEMO_MAX_PER_DAY
_daily_counter: dict = {"date": None, "count": 0}


# ---------------------------------------------------------------------------
# Anti-AI Effects Dictionary — injected into every Gemini prompt
# ---------------------------------------------------------------------------

ANTI_AI_EFFECTS_DICTIONARY = """
MANDATORY DESIGN RULES — Follow these EXACTLY:

1. EDITORIAL NEO-MINIMALIST AESTHETICS:
   - Use massive, bold typography (text-5xl to text-8xl for hero headings)
   - Extreme negative whitespace (py-24, py-32 between sections)
   - Strict monochromatic or duotone color palette derived from brand colors
   - No gradients unless subtle and intentional

2. BENTO BOX GRID LAYOUTS:
   - Feature sections use asymmetrical grid cards (grid-cols-2, grid-cols-3 with varying spans)
   - Crisp solid borders (border, border-2) or ultra-clean rounding (rounded-2xl)
   - NO floating components, NO random positioning

3. STAGGERED SCROLL REVEALS & CLIP PANNING:
   - Use Alpine.js x-intersect for scroll-triggered animations
   - Text reveals via clip-path or translate transforms
   - Staggered timing delays (100ms, 200ms, 300ms per element)
   - Elements slide firmly into place, not just fade

4. KINETIC HOVER PHYSICS (NO GLOWS):
   - Buttons use sharp solid shadow offsets: shadow-[4px_4px_0_0_#000]
   - On hover: translate + shadow removal for "press" effect
   - Smooth transitions on background-color and transform only
   - NEVER use box-shadow glow, neon effects, or blur-based shadows

5. PARALLAX SCROLLING:
   - Subtle depth via background-attachment: fixed or JS-based scroll speed
   - Large decorative typography or shapes scroll at different speed than content

6. SMOOTH ACCORDIONS & MARQUEES:
   - FAQ section uses Alpine.js x-data with smooth height transitions
   - Continuously scrolling ribbon/marquee banners using CSS animation
   - Provides subtle motion without overwhelming

7. INTERACTIVE ELEMENTS:
   - Smooth scroll navigation between sections
   - Contact/CTA buttons with magnetic hover effects
   - Mobile hamburger menu with slide animation

ABSOLUTELY BANNED — NEVER use these:
  ✗ Glassmorphism (backdrop-blur, frosted glass effects)
  ✗ Glowing box-shadows or neon shadows
  ✗ Generic gradient hero backgrounds
  ✗ Floating blob shapes
  ✗ AI-looking template patterns
  ✗ Dark mode with neon accents
  ✗ Card-heavy layouts without variation
  ✗ Stock-photo hero sections
"""


async def generate_landing_page_html(brand_blueprint: dict) -> str | None:
    """
    Generates a complete, self-contained HTML landing page using Gemini.

    Args:
        brand_blueprint: Structured brand context from brand_extractor.py.

    Returns:
        str: Complete HTML string (<!DOCTYPE html>...</html>), or None on failure.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set — skipping demo generation")
        return None

    system_prompt = f"""You are an elite web designer at a premium digital agency.
You generate COMPLETE, PRODUCTION-READY, single-file HTML landing pages.

TECHNICAL REQUIREMENTS:
- Output a SINGLE, complete HTML file starting with <!DOCTYPE html>
- Use TailwindCSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Use Alpine.js via CDN: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
- Use Google Fonts via <link> tag — choose a font that matches the brand tone
- Use placeholder images from https://placehold.co/ with relevant dimensions and text
- Make it FULLY RESPONSIVE (mobile-first approach)
- Include smooth scroll behavior
- NO external JavaScript files besides the CDNs listed above
- NO backend dependencies — everything is self-contained
- The page MUST look like it was hand-crafted by an expensive agency, NOT like an AI template

{ANTI_AI_EFFECTS_DICTIONARY}

SECTIONS TO INCLUDE (adapt to the business type):
1. Hero section with business name, tagline, and primary CTA
2. About/Story section
3. Services/Features in a Bento Box grid
4. Social proof (ratings, review count from Google)
5. Location/Contact section with address and phone
6. Footer with business info

OUTPUT FORMAT:
Return ONLY a JSON object: {{"html_code": "<!DOCTYPE html>..."}}
Do NOT include markdown code fences. Return ONLY the JSON object."""

    user_prompt = f"""Generate a stunning landing page for this business:

BRAND BLUEPRINT:
{json.dumps(brand_blueprint, indent=2)}

Remember:
- Use their exact brand colors (primary: {brand_blueprint.get('primary_color', '#1a1a1a')}, secondary: {brand_blueprint.get('secondary_color', '#f5f5f5')}, accent: {brand_blueprint.get('accent_color', '#e63946')})
- Match the tone: {brand_blueprint.get('tone', 'professional')}
- Font style preference: {brand_blueprint.get('font_style', 'sans-serif')}
- Business category: {brand_blueprint.get('category', 'Local Business')}
- Include their phone: {brand_blueprint.get('phone', '')}
- Include their address: {brand_blueprint.get('address', '')}
- Google rating: {brand_blueprint.get('rating', 'N/A')} stars ({brand_blueprint.get('review_count', 0)} reviews)

Make this page look PREMIUM and UNIQUE to this specific business."""

    # All counter checks and Gemini calls are serialized through this semaphore.
    # This guarantees the daily cap is atomic within a single-worker process.
    # For multi-worker deployments, replace with a Redis counter or DB advisory lock.
    async with _GEMINI_SEMAPHORE:
        # Enforce daily generation cap inside the lock
        today = date.today()
        if _daily_counter["date"] != today:
            _daily_counter["date"] = today
            _daily_counter["count"] = 0

        if _daily_counter["count"] >= settings.DEMO_MAX_PER_DAY:
            logger.warning(
                f"Daily demo generation limit reached ({settings.DEMO_MAX_PER_DAY}). "
                "Skipping to stay within Gemini free tier."
            )
            return None

        try:
            html = await _call_gemini(system_prompt, user_prompt)
            await asyncio.sleep(_MIN_REQUEST_INTERVAL)
            if html:
                _daily_counter["count"] += 1
            return html
        except Exception as e:
            logger.error(f"Gemini generation failed: {e}")
            return None


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=2, min=5, max=30))
async def _call_gemini(system_prompt: str, user_prompt: str) -> str | None:
    """
    Makes the actual Gemini API call with retry logic.
    Runs the synchronous SDK call in a thread executor to avoid blocking.
    """
    import google.generativeai as genai

    genai.configure(api_key=settings.GEMINI_API_KEY)

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config=genai.GenerationConfig(
            temperature=0.7,
            max_output_tokens=16384,
            response_mime_type="application/json",
        ),
        system_instruction=system_prompt,
    )

    loop = asyncio.get_running_loop()
    try:
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: model.generate_content(
                    user_prompt,
                    request_options={"timeout": 90},
                ),
            ),
            timeout=120,
        )
    except asyncio.TimeoutError:
        logger.error("Gemini API call timed out after 120s")
        return None
    except Exception as e:
        error_str = str(e).lower()
        if "resourceexhausted" in error_str or "quota" in error_str or "429" in error_str:
            logger.warning(f"Gemini free tier quota exhausted: {e}. Stopping retries.")
            # Max out the daily counter to prevent further attempts today
            _daily_counter["count"] = settings.DEMO_MAX_PER_DAY
            return None
        raise  # Let tenacity handle other errors

    if not response or not response.text:
        logger.warning("Gemini returned empty response")
        return None

    # Clean up the text by removing all common markdown code block wrappers
    text = response.text.strip()
    
    # Remove markdown code fences if present (e.g. ```json ... ``` or ```html ... ``` or just ``` ... ```)
    import re
    text = re.sub(r'^```(?:json|html)?\n?', '', text)
    text = re.sub(r'\n?```$', '', text)
    text = text.strip()
    
    logger.debug(f"Raw Gemini response (first 500 chars): {text[:500]}")
    
    # 1. Try to parse as JSON first
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "html_code" in parsed:
            return parsed.get("html_code")
    except json.JSONDecodeError:
        pass

    # 2. If it's not JSON, check if it's raw HTML
    text_upper = text[:1000].upper()
    if "<!DOCTYPE" in text_upper or "<HTML" in text_upper:
        # Find where the HTML actually starts
        start_idx = text.lower().find("<!doctype")
        if start_idx == -1:
            start_idx = text.lower().find("<html")
        
        if start_idx != -1:
            return text[start_idx:]

    # 3. If it's still not found, check for ANY <html> tag
    if "<html>" in text.lower():
         start_idx = text.lower().find("<html")
         return text[start_idx:]

    logger.warning(f"Gemini response was neither valid JSON nor HTML matching requirements. Start: {text[:200]}")
    return None
