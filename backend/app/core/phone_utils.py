"""
Phone-number normalization helpers.

Used by the WhatsApp deep-link endpoint and any other surface that needs to
build a ``wa.me/{digits}`` URL. ``wa.me`` requires the **full international
number with the country dial code, no leading +, no spaces**. Real-world
lead phone numbers come from Google Places in many shapes:

    "+91 9876543210"            → 919876543210
    "(987) 654-3210"            → +country_code → e.g. 19876543210 for US
    "098 7654 3210"             → drop leading 0 → prepend dial code
    "9876543210"                → no country code; prepend lead.country_code
    "+91-987-654-3210 ext 5"    → 919876543210 (extension dropped)

The helper is intentionally pure (no I/O) so callers can unit-test it
without standing up the full phone library. We avoid the heavy
``phonenumbers`` package — a lookup table for common countries is enough
for our discovery surface area and keeps backend dependencies minimal.
"""
from __future__ import annotations

from typing import Optional

# ISO 3166-1 alpha-2 → E.164 country dial code (without leading +).
# Covers the markets Cold Scout's discovery currently targets. New markets
# can be added without a migration.
COUNTRY_DIAL_CODES: dict[str, str] = {
    "AE": "971",  # United Arab Emirates
    "AR": "54",   # Argentina
    "AT": "43",   # Austria
    "AU": "61",   # Australia
    "BD": "880",  # Bangladesh
    "BE": "32",   # Belgium
    "BR": "55",   # Brazil
    "CA": "1",    # Canada
    "CH": "41",   # Switzerland
    "CL": "56",   # Chile
    "CN": "86",   # China
    "CO": "57",   # Colombia
    "DE": "49",   # Germany
    "DK": "45",   # Denmark
    "EG": "20",   # Egypt
    "ES": "34",   # Spain
    "FR": "33",   # France
    "GB": "44",   # United Kingdom
    "GR": "30",   # Greece
    "HK": "852",  # Hong Kong
    "ID": "62",   # Indonesia
    "IE": "353",  # Ireland
    "IL": "972",  # Israel
    "IN": "91",   # India
    "IT": "39",   # Italy
    "JP": "81",   # Japan
    "KE": "254",  # Kenya
    "KR": "82",   # South Korea
    "LK": "94",   # Sri Lanka
    "MX": "52",   # Mexico
    "MY": "60",   # Malaysia
    "NG": "234",  # Nigeria
    "NL": "31",   # Netherlands
    "NO": "47",   # Norway
    "NP": "977",  # Nepal
    "NZ": "64",   # New Zealand
    "PH": "63",   # Philippines
    "PK": "92",   # Pakistan
    "PL": "48",   # Poland
    "PT": "351",  # Portugal
    "QA": "974",  # Qatar
    "RU": "7",    # Russia
    "SA": "966",  # Saudi Arabia
    "SE": "46",   # Sweden
    "SG": "65",   # Singapore
    "TH": "66",   # Thailand
    "TR": "90",   # Turkey
    "TW": "886",  # Taiwan
    "UA": "380",  # Ukraine
    "US": "1",    # United States
    "VN": "84",   # Vietnam
    "ZA": "27",   # South Africa
}

# Maximum digit length supported by E.164 — anything over this is malformed
# (most likely an extension that wasn't separated cleanly).
_E164_MAX = 15

# Minimum digits we'll trust for a wa.me URL. Below this it's almost
# certainly truncated or a placeholder.
_MIN_E164 = 8


def _digits_only(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def normalize_for_whatsapp(
    raw_phone: str,
    country_code: Optional[str] = None,
) -> Optional[str]:
    """Return wa.me-compatible digits, or ``None`` if the input is unusable.

    Strategy:

    1. Strip everything except digits. If the input started with a leading
       ``+`` we know the user already provided E.164 — accept the digits
       as-is provided they're long enough.
    2. If we have a ``country_code`` (ISO alpha-2), look up the dial code.
       If the digits already start with that dial code AND the total length
       is plausible, accept them.
    3. If the digits start with a single leading ``0`` (national-trunk
       prefix in many countries), drop it and prepend the dial code.
    4. Otherwise, prepend the dial code unconditionally.
    5. If we have no ``country_code`` we accept the digits as-is — this
       covers numbers Google Places returned in pure E.164.
    """
    if not raw_phone:
        return None

    starts_plus = raw_phone.lstrip().startswith("+")
    digits = _digits_only(raw_phone)

    if not digits:
        return None
    if len(digits) > _E164_MAX:
        # Likely contains an extension. Take the first 15 digits.
        digits = digits[:_E164_MAX]

    iso = (country_code or "").strip().upper()
    dial = COUNTRY_DIAL_CODES.get(iso) if iso else None

    if starts_plus:
        # User-provided E.164. Trust the digits they gave.
        return digits if len(digits) >= _MIN_E164 else None

    if dial:
        if digits.startswith(dial):
            # Already includes the dial code (e.g. "919876543210" with IN).
            return digits if len(digits) >= _MIN_E164 else None

        # Drop a single leading zero (national-trunk prefix) before
        # prepending the dial code.
        if digits.startswith("0"):
            digits = digits.lstrip("0")
            if not digits:
                return None

        candidate = dial + digits
        if len(candidate) > _E164_MAX:
            return None
        return candidate if len(candidate) >= _MIN_E164 else None

    # No country code hint — fall back to the digits as-is. This covers
    # leads whose phone column was already pre-normalized to E.164 by an
    # upstream enrichment step.
    return digits if len(digits) >= _MIN_E164 else None
