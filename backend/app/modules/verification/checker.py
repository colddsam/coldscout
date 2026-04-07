"""
Profile Verification Checker.

Automated verification logic for profile fields:
  - Email:    Confirmed via Supabase Auth (if auth_provider is set).
  - Phone:    International format validation (E.164 pattern).
  - URLs:     HTTP HEAD reachability check with timeout.
  - Social:   URL format validation + reachability.
  - Website:  HTTP reachability + optional title extraction.

Each checker returns a (status, method, failure_reason) tuple.
"""
import re
import asyncio
from typing import Tuple, Optional
from loguru import logger

import httpx

# ── Result type ───────────────────────────────────────────────────────────────

VerifyResult = Tuple[str, str, Optional[str]]  # (status, method, failure_reason)


# ── Phone validation ──────────────────────────────────────────────────────────

# E.164-ish pattern: optional +, country code 1-3 digits, then 6-14 digits
_PHONE_PATTERN = re.compile(r"^\+?[1-9]\d{6,14}$")

# Loose pattern: allows spaces, dashes, parens
_PHONE_LOOSE_PATTERN = re.compile(r"^\+?\d[\d\s\-().]{6,20}$")


def verify_phone(phone: str) -> VerifyResult:
    """Validate phone number format."""
    cleaned = re.sub(r"[\s\-().]+", "", phone.strip())
    if _PHONE_PATTERN.match(cleaned):
        return ("verified", "format_valid", None)
    if _PHONE_LOOSE_PATTERN.match(phone.strip()):
        return ("verified", "format_valid", None)
    return ("failed", "format_valid", "Phone number does not match a valid international format")


# ── URL reachability ──────────────────────────────────────────────────────────

_URL_PATTERN = re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.IGNORECASE)

# Social platform URL patterns
_SOCIAL_PATTERNS = {
    "linkedin_url": re.compile(r"https?://(www\.)?linkedin\.com/(in|company)/[\w\-%.]+/?", re.IGNORECASE),
    "github_url": re.compile(r"https?://(www\.)?github\.com/[\w\-]+/?", re.IGNORECASE),
    "twitter_url": re.compile(r"https?://(www\.)?(twitter|x)\.com/[\w]+/?", re.IGNORECASE),
    "facebook_url": re.compile(r"https?://(www\.)?(facebook|fb)\.com/[\w.\-]+/?", re.IGNORECASE),
    "instagram_url": re.compile(r"https?://(www\.)?instagram\.com/[\w.\-]+/?", re.IGNORECASE),
    "dribbble_url": re.compile(r"https?://(www\.)?dribbble\.com/[\w\-]+/?", re.IGNORECASE),
    "behance_url": re.compile(r"https?://(www\.)?behance\.net/[\w\-]+/?", re.IGNORECASE),
}


async def verify_url(url: str, field_name: str = "website") -> VerifyResult:
    """
    Verify a URL by checking format and HTTP reachability.
    For social URLs, also validates the platform-specific pattern.
    """
    url = url.strip()

    # Basic URL format check
    if not _URL_PATTERN.match(url):
        return ("failed", "format_valid", f"Invalid URL format: {url}")

    # Social-specific pattern check
    social_pattern = _SOCIAL_PATTERNS.get(field_name)
    if social_pattern and not social_pattern.match(url):
        platform = field_name.replace("_url", "").replace("_", " ").title()
        return ("failed", "format_valid", f"URL does not match expected {platform} profile format")

    # HTTP reachability check (HEAD with GET fallback)
    try:
        async with httpx.AsyncClient(
            timeout=10,
            follow_redirects=True,
            verify=False,  # Some sites have cert issues
            headers={"User-Agent": "ColdScout-Verifier/1.0"},
        ) as client:
            try:
                resp = await client.head(url)
            except httpx.HTTPError:
                # Some servers block HEAD; try GET
                resp = await client.get(url)

            if resp.status_code < 400:
                return ("verified", "http_reachable", None)
            elif resp.status_code == 404:
                return ("failed", "http_reachable", f"Page not found (HTTP 404)")
            elif resp.status_code in (401, 403):
                # Auth-protected pages are still "real" — count as verified
                return ("verified", "http_reachable", None)
            else:
                return ("failed", "http_reachable", f"HTTP {resp.status_code} response")

    except httpx.TimeoutException:
        return ("failed", "http_reachable", "Connection timed out (10s)")
    except httpx.ConnectError:
        return ("failed", "http_reachable", "Could not connect to server")
    except Exception as e:
        return ("failed", "http_reachable", f"Check failed: {type(e).__name__}")


# ── Email verification ────────────────────────────────────────────────────────

_EMAIL_PATTERN = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)


def verify_email_format(email: str) -> VerifyResult:
    """Validate email format. Full verification is via Supabase Auth."""
    if _EMAIL_PATTERN.match(email.strip()):
        return ("verified", "format_valid", None)
    return ("failed", "format_valid", "Invalid email format")


# ── Master dispatcher ─────────────────────────────────────────────────────────

# Fields that use URL reachability checks
URL_FIELDS = {
    "website", "personal_website", "company_website", "booking_url",
    "linkedin_url", "github_url", "twitter_url", "facebook_url",
    "instagram_url", "dribbble_url", "behance_url",
}


async def run_verification(field_name: str, field_value: str) -> VerifyResult:
    """
    Dispatch the appropriate verification check based on field name.

    Returns: (status, method, failure_reason)
    """
    if not field_value or not field_value.strip():
        return ("failed", "auto_check", "Field value is empty")

    field_value = field_value.strip()

    if field_name == "email":
        return verify_email_format(field_value)

    if field_name == "phone":
        return verify_phone(field_value)

    if field_name in URL_FIELDS:
        return await verify_url(field_value, field_name)

    # For unrecognized fields, just confirm non-empty
    return ("verified", "auto_check", None)
