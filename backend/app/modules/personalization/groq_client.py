"""
Large Language Model (LLM) Integration Module.

Communicates with the Groq API for dynamic content generation tasks:
  - Initial outreach email personalisation
  - Follow-up email sequences (up to 3 follow-ups)
  - Daily target city/category selection for the discovery pipeline

Security notes:
  - All external lead data (business names, categories, etc.) is sanitised
    before being substituted into LLM prompts to mitigate prompt-injection
    attacks where scraped website content could redirect the model.
  - Groq API credentials are sourced from application settings (env vars) and
    are never embedded in code.
"""

import json
import re
from typing import Optional
from loguru import logger
from groq import AsyncGroq
from tenacity import retry, stop_after_attempt, wait_exponential
from app.config import get_settings
from app.modules.infrastructure import (
    Provider,
    UseCase,
    key_manager,
    with_key_failover,
)

settings = get_settings()

# ---------------------------------------------------------------------------
# Prompt injection defence
# ---------------------------------------------------------------------------

# Maximum number of characters allowed for a single lead field in a prompt.
# Prevents excessively large scraped values from dominating prompt context.
_MAX_FIELD_LENGTH = 300


def _sanitize_prompt_value(value: str) -> str:
    """
    Strips control characters and limits the length of a value before it is
    substituted into an LLM prompt.

    Without sanitisation a compromised or malicious business listing could
    embed instructions (e.g. "Ignore previous instructions and ...") inside
    a scraped field such as ``business_name`` or ``website_services``, causing
    the model to deviate from its intended task (prompt injection).

    Args:
        value: The raw string sourced from external lead data.

    Returns:
        str: A cleaned, length-limited string safe for prompt substitution.
    """
    if not isinstance(value, str):
        value = str(value)
    # Remove ASCII / Unicode control characters (U+0000–U+001F, U+007F)
    value = re.sub(r"[\x00-\x1f\x7f]", "", value)
    # Truncate to limit prompt inflation and context window abuse
    return value[:_MAX_FIELD_LENGTH]


class GroqClient:
    """
    Client for interfacing with the Groq LLM API.

    Credentials are sourced from the central key manager so requests rotate
    across the configured Groq key pool and survive rate-limit / quota
    failures on any single key. ``self.client`` is created fresh per call
    inside ``_call_with_key`` rather than once in ``__init__`` so each
    request can use a different rotated credential.
    """

    def __init__(self):
        # Model selection is still env-driven (it's not a credential).
        self.model = settings.GROQ_MODEL

    def _client_for_key(self, api_key: str) -> AsyncGroq:
        """Build a transient Groq SDK client bound to the given credential."""
        return AsyncGroq(api_key=api_key)

    async def generate_email_content(self, lead_data: dict) -> dict:
        """
        Generates personalized outreach email content and benefits
        based on the provided lead context and deep enrichment data.
        """
        prompt_template = f"""
You are writing a casual, warm outreach email — like a friend who happens to do web work,
not a marketing agency. The recipient runs a real local business and gets dozens of cold
emails every week, almost all of them obviously templated. Yours has to feel hand-written.

Business: $business_name
Category: $category
Location: $location
Rating: $rating stars on Google ($review_count reviews)
Current web presence: $qualification_notes

Deep Enrichment Context:
- Website Title: $website_title
- Services Mentioned: $website_services
- Copyright Year: $website_year
- Local Competitor: $competitor_name

HARD RULES (violating any of these makes the email feel robotic — DO NOT BREAK):
- NEVER start with "I came across", "I noticed", "I hope this email finds you well",
  "My name is", "I wanted to reach out", or any other generic cold-email opener.
- NEVER use the phrase "in today's digital age" or any clichéd marketing prose.
- NEVER use words like "leverage", "synergy", "robust", "cutting-edge", "solution",
  "elevate", "empower", or "unlock potential".
- NEVER over-praise ("amazing reviews!", "fantastic business!"). One specific,
  earned compliment is enough.
- Use contractions (it's, you're, I'd) — avoid sounding stiff.
- Sentences should vary in length. Mix short punchy ones with longer thoughtful ones.

Requirements:
- Subject line: Specific to their business, max 55 chars, no clickbait, no emojis,
  no "Quick question" / "Fwd:" / "Re:" tricks.
- Email body in HTML (<p> tags only). 3 short paragraphs, ~120-180 words total.
- Paragraph 1 (1-2 sentences): One concrete observation about their specific
  business — a real signal from the enrichment context (their rating, services
  they list, an outdated copyright year, a competitor's edge, the city).
  No fake flattery; just something true that proves you actually looked.
- Paragraph 2 (2-3 sentences): What you'd actually build/improve, framed
  around outcomes a $category owner cares about (more bookings, fewer phone
  tag chains, easier to find on Google, mobile-friendly, etc.). Concrete,
  not abstract.
- Paragraph 3 (1 sentence): A soft, low-friction ask — e.g. "Worth a 15-min
  call this week?" or "Want me to send a quick mockup?" Make it easy to say yes.
- "benefits": 3 short bullet phrases (≤8 words each), each tying to a real
  $category outcome, no fluff.

Return ONLY a valid JSON object in the following format:
{{
  "subject": "...",
  "body_html": "<p>...</p><p>...</p><p>...</p>",
  "benefits": ["...", "...", "..."]
}}
"""
        from app.core.database import get_session_maker
        from app.models.prompt_config import PromptConfig
        from sqlalchemy import select
        
        try:
            async with get_session_maker()() as db:
                stmt = select(PromptConfig).where(PromptConfig.prompt_type == "initial_outreach", PromptConfig.is_active == True)
                res = await db.execute(stmt)
                db_prompt = res.scalars().first()
                if db_prompt:
                    prompt_template = db_prompt.prompt_text
        except Exception as e:
            logger.warning(f"Could not load dynamic prompt, using fallback: {e}")
            
        from string import Template
        
        # Sanitise all lead fields before substitution to prevent prompt injection.
        # Lead data originates from external sources (Google Places, web scraping)
        # and could contain adversarial instructions embedded in scraped content.
        mapping = {
            "business_name": _sanitize_prompt_value(lead_data.get('business_name', 'your business')),
            "category": _sanitize_prompt_value(lead_data.get('category', 'business')),
            "location": _sanitize_prompt_value(
                ", ".join(filter(None, [
                    lead_data.get('sub_area'),
                    lead_data.get('location') or lead_data.get('city'),
                    lead_data.get('region'),
                    lead_data.get('country'),
                ])) or 'your area'
            ),
            "rating": _sanitize_prompt_value(str(lead_data.get('rating', 'good'))),
            "review_count": _sanitize_prompt_value(str(lead_data.get('review_count', 'some'))),
            "qualification_notes": _sanitize_prompt_value(lead_data.get('qualification_notes', 'needs improvement')),
            "website_title": _sanitize_prompt_value(lead_data.get('website_title', 'None')),
            "website_services": _sanitize_prompt_value(', '.join(lead_data.get('website_services', []))),
            "website_year": _sanitize_prompt_value(str(lead_data.get('website_year', 'None'))),
            "competitor_name": _sanitize_prompt_value(lead_data.get('competitor_name', 'None')),
        }
        
        try:
            # Use Template.safe_substitute to ignore extra placeholders in the prompt
            prompt = Template(prompt_template).safe_substitute(mapping)
        except Exception as e:
            logger.error(f"Error formatting prompt template: {e}")
            # Fallback to a very simple version if even Template fails
            prompt = f"Write an outreach email for {mapping['business_name']}."
        
        # No inner @retry: ``with_key_failover`` already rotates+retries up
        # to 4 times. An inner tenacity loop would re-issue the same
        # rate-limited key before rotation, burning attempts.
        @with_key_failover(Provider.GROQ, UseCase.PERSONALIZATION)
        async def _call_groq(prompt_text, *, api_key: str):
            client = self._client_for_key(api_key)
            return await client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": prompt_text,
                    }
                ],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.7,
            )

        try:
            chat_completion = await _call_groq(prompt)
            result = chat_completion.choices[0].message.content
            return json.loads(result)
        except Exception:
            # Re-raise so the personalization stage leaves the lead at
            # ``qualified`` for the next run to retry. Returning a hard-coded
            # boilerplate email here used to silently consume the lead and
            # send "Enhance your digital presence" — destroying brand trust
            # and forfeiting the lead's first-impression budget.
            logger.exception("Groq personalization failed; lead will be re-tried next run")
            raise

    async def generate_whatsapp_message(
        self,
        lead_data: dict,
        sender_name: Optional[str] = None,
        demo_url: Optional[str] = None,
    ) -> dict:
        """Generate a short, conversational WhatsApp message for a lead.

        WhatsApp is read on phones — the message must be brief, plain-text,
        warm, and not feel like a marketing blast. Returned as a dict with
        a single ``message`` key so callers can swap it into the wa.me URL.

        On any Groq failure we fall back to a hand-tuned template so the
        WhatsApp button is never blocked.
        """
        prompt_template = f"""
You are writing a short, casual WhatsApp message to the owner of a local business
you'd like to help with their online presence. WhatsApp messages are read on a
phone in seconds — long, salesy text gets ignored.

Business: $business_name
Category: $category
Location: $location
Rating: $rating stars on Google ($review_count reviews)
Sender's name: $sender_name
Demo link (only include in the message if provided and non-empty): $demo_url

HARD RULES (violating any makes the message feel robotic — DO NOT BREAK):
- NEVER start with "I came across", "I noticed", "Hope this finds you well",
  "Greetings", or "Dear sir/ma'am". Open like a human would on WhatsApp.
- NEVER use marketing words: leverage, synergy, robust, solution, elevate,
  empower, unlock potential, in today's digital age.
- NO emojis except maybe a single 👋 in the greeting (only if it feels natural).
- Total length: 35-70 words. Three to five short lines, each under ~15 words.
- Use line breaks (\\n) between thoughts so it reads like a chat, not a paragraph.
- One specific, earned compliment OR observation tied to a real signal
  (rating, location, category) — not generic praise.
- End with one soft, low-friction question. NEVER ask "are you the owner?" /
  "is this the right number?" — assume yes and get straight to the point.
- Sign off with the sender's first name on its own line.
- If "demo_url" is provided and non-empty, include it on its own line near the
  end as: "Quick demo I made for you: <url>" — otherwise OMIT entirely.

Return ONLY a valid JSON object:
{{
  "message": "Hey ...\\n...\\n— FirstName"
}}
"""
        from app.core.database import get_session_maker
        from app.models.prompt_config import PromptConfig
        from sqlalchemy import select

        try:
            async with get_session_maker()() as db:
                stmt = select(PromptConfig).where(
                    PromptConfig.prompt_type == "whatsapp_outreach",
                    PromptConfig.is_active == True,
                )
                res = await db.execute(stmt)
                db_prompt = res.scalars().first()
                if db_prompt:
                    prompt_template = db_prompt.prompt_text
        except Exception as e:
            logger.warning(f"Could not load dynamic whatsapp prompt, using fallback: {e}")

        from string import Template

        sender_label = (sender_name or "").strip() or "Cold Scout"
        first_name = sender_label.split()[0] if sender_label else "there"

        mapping = {
            "business_name": _sanitize_prompt_value(lead_data.get("business_name", "your business")),
            "category": _sanitize_prompt_value(lead_data.get("category", "business")),
            "location": _sanitize_prompt_value(
                ", ".join(filter(None, [
                    lead_data.get("sub_area"),
                    lead_data.get("location") or lead_data.get("city"),
                    lead_data.get("region"),
                    lead_data.get("country"),
                ])) or "your area"
            ),
            "rating": _sanitize_prompt_value(str(lead_data.get("rating") or "good")),
            "review_count": _sanitize_prompt_value(str(lead_data.get("review_count") or "many")),
            "sender_name": _sanitize_prompt_value(sender_label),
            "demo_url": _sanitize_prompt_value(demo_url or ""),
        }

        try:
            prompt = Template(prompt_template).safe_substitute(mapping)
        except Exception as e:
            logger.error(f"Error formatting whatsapp prompt template: {e}")
            prompt = f"Write a short whatsapp message for {mapping['business_name']}."

        @with_key_failover(Provider.GROQ, UseCase.PERSONALIZATION)
        async def _call_groq(prompt_text: str, *, api_key: str):
            client = self._client_for_key(api_key)
            return await client.chat.completions.create(
                messages=[{"role": "user", "content": prompt_text}],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.8,
            )

        try:
            chat_completion = await _call_groq(prompt)
            data = json.loads(chat_completion.choices[0].message.content)
            message = (data.get("message") or "").strip()
            if not message:
                raise ValueError("Groq returned an empty whatsapp message")
            # Soft length cap so the wa.me URL never overflows on legacy clients.
            if len(message) > 900:
                message = message[:880].rstrip() + " …"
            return {"message": message}
        except Exception as e:
            logger.warning(f"Groq whatsapp generation failed, falling back to template: {e}")
            biz = mapping["business_name"]
            city = lead_data.get("city") or lead_data.get("location") or ""
            cat = lead_data.get("category") or "business"
            rating = lead_data.get("rating")
            opener_extra = f" — saw the {rating}-star reviews" if rating else ""
            location_bit = f" in {city}" if city else ""
            demo_line = (
                f"\nQuick demo I made for you: {demo_url}"
                if demo_url
                else ""
            )
            fallback = (
                f"Hey {biz} team 👋\n"
                f"Came by your {cat}{location_bit}{opener_extra}.\n"
                f"I help {cat} owners get more bookings with a sharper site & "
                f"clearer next-step buttons.{demo_line}\n"
                f"Worth a 5-min look this week?\n"
                f"— {first_name}"
            )
            return {"message": fallback}

    async def generate_daily_targets(
        self,
        exclude_locations: list,
        exclude_categories: list,
        country_focus: list = None,
        depth: str = "sub_area",
        target_count: int = 4,
    ) -> list:
        """
        Determines novel geographic and categorical targets for discovery,
        bypassing recently utilized combinations.

        Supports international multi-level targeting with configurable depth.

        Args:
            exclude_locations: List of dicts {country_code, city, sub_area} recently searched.
            exclude_categories: List of category strings recently used.
            country_focus: List of ISO 3166-1 alpha-2 codes to focus on (e.g. ["IN", "US"]).
                           None or empty means worldwide.
            depth: How deep to go — "country", "region", "city", or "sub_area".
            target_count: Number of targets to generate per run.

        Returns:
            List of target dicts with keys: country, country_code, region, city,
            sub_area, category.
        """
        focus_str = ", ".join(country_focus) if country_focus else "any country — pick diverse markets"

        prompt = f"""
You are an expert international sales strategist targeting local businesses worldwide.

COUNTRY FOCUS: {focus_str}

Generate {target_count} discovery targets. For each target, provide the FULL location hierarchy:
- country: Full country name
- country_code: ISO 3166-1 alpha-2 code (e.g., "US", "IN", "GB", "AE", "AU")
- region: State/province/emirate (e.g., "California", "Maharashtra", "Dubai")
- city: City name
- sub_area: Neighborhood, borough, district, or postal code area (e.g., "Brooklyn", "Bandra West", "Deira", "EC1")
- category: Specific local business category

DEPTH RULES:
- Always provide country + country_code + city + category
- If depth is "region" or deeper, include region
- If depth is "sub_area", include sub_area for MAXIMUM granularity

Pick locations where small-to-medium businesses would benefit from digital presence.
Prefer tier-2/tier-3 cities and specific neighborhoods in tier-1 cities.
Vary across different countries for diversity.

Good category examples: Dentists, Bakeries, Salons, Boutique Hotels, Fitness Trainers, Gyms, Pet Clinics, Accounting Firms, Law Firms, Wedding Planners, Real Estate Agencies, Plumbers, Auto Repair Shops, Photography Studios, Tutoring Centers.

AVOID these locations (recently searched): {exclude_locations}
AVOID these categories (recently used): {exclude_categories}

Return ONLY a JSON object:
{{
  "targets": [
    {{
      "country": "United States",
      "country_code": "US",
      "region": "Texas",
      "city": "Austin",
      "sub_area": "East Austin",
      "category": "Yoga Studios"
    }}
  ]
}}
"""
        @with_key_failover(Provider.GROQ, UseCase.DISCOVERY)
        async def _call_groq(prompt_text: str, *, api_key: str):
            client = self._client_for_key(api_key)
            return await client.chat.completions.create(
                messages=[{"role": "user", "content": prompt_text}],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.8,
            )

        try:
            logger.info("Calling Groq to generate international daily targets")
            chat_completion = await _call_groq(prompt)
            data = json.loads(chat_completion.choices[0].message.content)
            return data.get("targets", [])
        except Exception as e:
            logger.exception("Error generating daily targets with Groq")
            raise e  # Trigger retry

    async def generate_followup_email(self, lead_data: dict, followup_number: int) -> dict:
        """
        followup_number: 1, 2, or 3
        """
        if followup_number == 1:
            angle = "A brief, polite check-in asking if they had a chance to see the proposal."
        elif followup_number == 2:
            angle = "Share a brief valuable stat or tip about their industry regarding digital presence."
        else:
            angle = "A final, polite 'break-up' email. If they aren't interested, that's fine, but leave the door open."

        prompt_template = f"""
You are a professional business development writer. Write a short, personalized follow-up email #$followup_number for:

Business: $business_name
Category: $category
Location: $location

Angle: $angle

Requirements:
- Subject line: Relevant to the angle, max 60 chars ("Re: " is good)
- Email body: 2-3 short paragraphs, conversational, in HTML format (<p> tags)
- Include a clear but very low-pressure CTA
- Keep it under 150 words

Return ONLY a valid JSON object in the following format:
{{
  "subject": "...",
  "body_html": "<p>...</p>"
}}
"""
        from app.core.database import get_session_maker
        from app.models.prompt_config import PromptConfig
        from sqlalchemy import select
        
        try:
            async with get_session_maker()() as db:
                stmt = select(PromptConfig).where(
                    PromptConfig.prompt_type == f"followup_{followup_number}", 
                    PromptConfig.is_active == True
                )
                res = await db.execute(stmt)
                db_prompt = res.scalars().first()
                if db_prompt:
                    prompt_template = db_prompt.prompt_text
        except Exception as e:
            logger.warning(f"Could not load dynamic follow-up prompt, using fallback: {e}")

        from string import Template
        # Sanitise external lead fields before prompt substitution.
        mapping = {
            "business_name": _sanitize_prompt_value(lead_data.get('business_name', 'your business')),
            "category": _sanitize_prompt_value(lead_data.get('category', 'business')),
            "location": _sanitize_prompt_value(
                ", ".join(filter(None, [
                    lead_data.get('sub_area'),
                    lead_data.get('location') or lead_data.get('city'),
                    lead_data.get('region'),
                    lead_data.get('country'),
                ])) or 'your area'
            ),
            "followup_number": followup_number,
            "angle": angle,
        }

        try:
            prompt = Template(prompt_template).safe_substitute(mapping)
        except Exception as e:
            logger.error(f"Error formatting follow-up prompt: {e}")
            prompt = f"Write a follow-up email #{followup_number} for {mapping['business_name']}."

        @with_key_failover(Provider.GROQ, UseCase.PERSONALIZATION)
        async def _call_groq(prompt_text: str, *, api_key: str):
            client = self._client_for_key(api_key)
            return await client.chat.completions.create(
                messages=[{"role": "user", "content": prompt_text}],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.7,
            )

        try:
            chat_completion = await _call_groq(prompt)
            return json.loads(chat_completion.choices[0].message.content)
        except Exception as e:
            logger.exception("Error calling Groq API for followup")
            raise e # Trigger retry
