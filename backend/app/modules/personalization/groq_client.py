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
from loguru import logger
from groq import AsyncGroq
from tenacity import retry, stop_after_attempt, wait_exponential
from app.config import get_settings

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
    """
    def __init__(self):
        self.client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        self.model = settings.GROQ_MODEL

    async def generate_email_content(self, lead_data: dict) -> dict:
        """
        Generates personalized outreach email content and benefits
        based on the provided lead context and deep enrichment data.
        """
        prompt_template = f"""
You are a professional business development writer. Write a short, warm outreach email for:

Business: $business_name
Category: $category
Location: $location
Rating: $rating stars on Google ($review_count reviews)
Current web presence: $qualification_notes

Deep Enrichment Context:
- Website Title: $website_title
- Services Mentioned: $website_services
- Copyright Year: $website_year
- Target Competitor: $competitor_name

Requirements:
- Subject line: Compelling, mentions business name, max 60 chars
- Email body: 3 short paragraphs, conversational but professional (in HTML format)
- Paragraph 1: Acknowledge their business specifically. Mention something from the Deep Enrichment Context if useful (e.g., complementing their specific services or noting they might need an update compared to a local competitor).
- Paragraph 2: Explain what a custom platform/website could do for their specific business type
- Paragraph 3: Soft CTA - ask if they'd like a free consultation
- Include 3 specific ROI benefits for a $category
- Tone: Helpful partner, not salesy
- Length: 150-200 words max

Return ONLY a valid JSON object in the following format:
{{
  "subject": "...",
  "body_html": "<p>...</p>",
  "benefits": ["Benefit 1", "Benefit 2", "Benefit 3"]
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
        
        @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
        async def _call_groq(prompt_text):
            return await self.client.chat.completions.create(
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
        except Exception as e:
            logger.exception("Error calling Groq API for personalization")
            return {
                "subject": f"Enhance {lead_data.get('business_name')} Digital Presence",
                "body_html": "<p>Hi,</p><p>We help businesses like yours build a strong digital presence.</p><p>Let's chat?</p>",
                "benefits": ["Increased visibility", "Better customer engagement", "More sales"]
            }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
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
        try:
            logger.info("Calling Groq to generate international daily targets")
            chat_completion = await self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.8,
            )
            data = json.loads(chat_completion.choices[0].message.content)
            return data.get("targets", [])
        except Exception as e:
            logger.exception("Error generating daily targets with Groq")
            raise e  # Trigger retry

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
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

        try:
            chat_completion = await self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.7,
            )
            return json.loads(chat_completion.choices[0].message.content)
        except Exception as e:
            logger.exception("Error calling Groq API for followup")
            raise e # Trigger retry
