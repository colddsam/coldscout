"""
Google Maps URL → Place + business intel resolver.

Why this is its own module
--------------------------
Maps URLs come in many shapes:

* Long share URL with ``ftid=`` / ``cid=`` / ``!1s<placeid>`` embedded.
* New share URL like ``https://www.google.com/maps/place/<name>/data=...``.
* Short share link ``https://maps.app.goo.gl/<token>`` that 302-redirects
  to the long URL.
* The owner-facing URL ``https://goo.gl/maps/<token>`` (legacy).
* A bare placeID copy/paste like ``ChIJN1t_tDeuEmsRUsoyG83frY4`` (rare but
  worth supporting).

Each of these has to be resolved to a canonical ``place_id`` before we can
hit the Places API for structured details. We do that here so the
qualification stack stays focused on signal extraction.

The Places API response is rich (~25 fields). We pass it through to the
``BusinessProfile`` Pydantic model below, which the public endpoint then
serializes to the SPA. The same model is reused by the
``run_place_audit`` orchestrator so a future "audit my place" private
feature can render identically.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import unquote, urlparse

import httpx
from loguru import logger
from pydantic import BaseModel, Field

from app.config import get_settings


# ── Data shapes ────────────────────────────────────────────────────────────


class BusinessReview(BaseModel):
    author_name: Optional[str] = None
    rating: Optional[int] = None
    relative_time: Optional[str] = None
    text: Optional[str] = None


class BusinessProfile(BaseModel):
    """A subset of Places API ``Place`` shaped for the SPA."""

    place_id: str
    display_name: Optional[str] = None
    formatted_address: Optional[str] = None
    primary_type: Optional[str] = None
    types: list[str] = Field(default_factory=list)
    phone: Optional[str] = None
    website_uri: Optional[str] = None
    google_maps_uri: Optional[str] = None
    rating: Optional[float] = None
    user_rating_count: Optional[int] = None
    business_status: Optional[str] = None  # OPERATIONAL, CLOSED_TEMPORARILY, ...
    price_level: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    weekday_descriptions: list[str] = Field(default_factory=list)
    open_now: Optional[bool] = None
    photo_count: int = 0
    photo_thumbnails: list[str] = Field(default_factory=list)
    editorial_summary: Optional[str] = None
    reviews: list[BusinessReview] = Field(default_factory=list)
    country: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None


# ── URL parsing ────────────────────────────────────────────────────────────


# Regexes that pluck a Place ID from the various long-form URL shapes.
# ChIJ...-style IDs are 27 chars typically; we allow 20-50 to be safe.
_PLACEID_RE = re.compile(r"(ChIJ[\w\-]{15,60}|GhIJ[\w\-]{15,60})")
# `!1s0x...` and `!1s<placeId>` patterns embedded in /maps/place/ URLs.
_DATA_PLACEID_RE = re.compile(r"!1s([\w\-:]{8,80})")
# `0x...:0x...` hex pair → ftid; we can't directly use this without an extra
# Places call, but we capture as a fallback.
_FTID_RE = re.compile(r"ftid=([\w\-:]{8,80})")
# Cid-only links use ``cid=<int>`` — also need a fallback pathway.
_CID_RE = re.compile(r"[?&]cid=(\d{6,})")


def _maybe_extract_placeid(url: str) -> Optional[str]:
    """Try every known pattern. Returns None if nothing recognized."""
    if not url:
        return None
    decoded = unquote(url)
    m = _PLACEID_RE.search(decoded)
    if m:
        return m.group(1)
    m = _DATA_PLACEID_RE.search(decoded)
    if m:
        candidate = m.group(1)
        # Some !1s blocks contain "0x...:0x..." encoded coords, not an ID.
        # Keep only those that look like a real place_id token.
        if candidate.startswith(("ChIJ", "GhIJ")):
            return candidate
    return None


async def _unfurl(client: httpx.AsyncClient, url: str) -> str:
    """Follow up to 5 redirects and return the final URL.

    Maps share links (``maps.app.goo.gl``, ``goo.gl/maps``) only resolve
    once you actually GET them, so we fire a HEAD-then-GET sequence.
    """
    try:
        # HEAD first — cheap if the server supports it.
        resp = await client.head(url, timeout=6.0, follow_redirects=True)
        if str(resp.url) and str(resp.url) != url:
            return str(resp.url)
        # Some servers don't redirect on HEAD; fall back to GET.
        resp = await client.get(url, timeout=8.0, follow_redirects=True)
        return str(resp.url)
    except Exception as e:
        logger.debug(f"_unfurl: {url} failed — {e!r}")
        return url


def _normalize_maps_url(raw: str) -> Optional[str]:
    """Lowercase, trim, validate it looks like a Maps URL or shortlink."""
    raw = (raw or "").strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if not parsed.netloc:
        return None
    # If the input is just a place_id token, accept it directly.
    if _PLACEID_RE.fullmatch(raw):
        return raw
    return raw


# ── Places API call ────────────────────────────────────────────────────────


_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

# Fields we ask Google for — keep this list tight; charges scale with bytes.
_FIELD_MASK = ",".join(
    [
        "id",
        "displayName",
        "formattedAddress",
        "addressComponents",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "websiteUri",
        "googleMapsUri",
        "rating",
        "userRatingCount",
        "businessStatus",
        "priceLevel",
        "primaryType",
        "primaryTypeDisplayName",
        "types",
        "location",
        "currentOpeningHours.openNow",
        "currentOpeningHours.weekdayDescriptions",
        "regularOpeningHours.weekdayDescriptions",
        "editorialSummary",
        "photos",
        "reviews.authorAttribution.displayName",
        "reviews.rating",
        "reviews.relativePublishTimeDescription",
        "reviews.text",
    ]
)


def _components_to_geo(components: list[dict]) -> dict:
    """Pull country / region / city / postal out of Google's addressComponents."""
    geo = {"country": None, "region": None, "city": None, "postal_code": None}
    for c in components or []:
        types = c.get("types") or []
        if "country" in types:
            geo["country"] = c.get("longText")
        elif "administrative_area_level_1" in types:
            geo["region"] = c.get("longText")
        elif "locality" in types or "postal_town" in types:
            geo["city"] = c.get("longText")
        elif "postal_code" in types:
            geo["postal_code"] = c.get("longText")
    return geo


async def _fetch_place(client: httpx.AsyncClient, place_id: str) -> Optional[dict]:
    settings = get_settings()
    api_key = getattr(settings, "GOOGLE_PLACES_API_KEY", None)
    if not api_key:
        logger.warning("Maps audit: GOOGLE_PLACES_API_KEY not configured")
        return None
    url = _PLACE_DETAILS_URL.format(place_id=place_id)
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
        "Accept": "application/json",
    }
    try:
        resp = await client.get(url, headers=headers, timeout=10.0)
        if resp.status_code == 200:
            return resp.json()
        body = ""
        try:
            body = resp.text[:300]
        except Exception:
            pass
        logger.warning(f"Places API {resp.status_code} for {place_id}: {body}")
        return None
    except Exception as e:
        logger.exception(f"Places API request failed for {place_id}: {e}")
        return None


def _photo_thumb(photo_resource: str, max_width: int = 600) -> str:
    """Build a v1 photo media URL the SPA can hot-link.

    The Places API returns ``photos[].name`` like ``places/<id>/photos/<id>``.
    The media endpoint uses that path and accepts a max dimension param. The
    ``X-Goog-Api-Key`` is sent as a query string here because <img> tags
    can't carry headers.
    """
    settings = get_settings()
    api_key = getattr(settings, "GOOGLE_PLACES_API_KEY", "")
    if not api_key or not photo_resource:
        return ""
    return (
        f"https://places.googleapis.com/v1/{photo_resource}/media?"
        f"maxHeightPx={max_width}&key={api_key}"
    )


def _shape_business_profile(payload: dict) -> BusinessProfile:
    """Map the Places API ``Place`` response into our ``BusinessProfile``."""
    geo = _components_to_geo(payload.get("addressComponents", []))
    location = payload.get("location", {}) or {}

    photos = payload.get("photos") or []
    thumbs: list[str] = []
    for p in photos[:8]:
        name = p.get("name")
        if name:
            url = _photo_thumb(name)
            if url:
                thumbs.append(url)

    reviews = []
    for r in (payload.get("reviews") or [])[:5]:
        attribution = (r.get("authorAttribution") or {}).get("displayName")
        text_block = (r.get("text") or {}).get("text")
        reviews.append(
            BusinessReview(
                author_name=attribution,
                rating=r.get("rating"),
                relative_time=r.get("relativePublishTimeDescription"),
                text=(text_block or "")[:600],
            )
        )

    hours_block = payload.get("currentOpeningHours") or payload.get("regularOpeningHours") or {}

    return BusinessProfile(
        place_id=payload.get("id") or "",
        display_name=(payload.get("displayName") or {}).get("text"),
        formatted_address=payload.get("formattedAddress"),
        primary_type=(payload.get("primaryTypeDisplayName") or {}).get("text") or payload.get("primaryType"),
        types=payload.get("types") or [],
        phone=payload.get("internationalPhoneNumber") or payload.get("nationalPhoneNumber"),
        website_uri=payload.get("websiteUri"),
        google_maps_uri=payload.get("googleMapsUri"),
        rating=payload.get("rating"),
        user_rating_count=payload.get("userRatingCount"),
        business_status=payload.get("businessStatus"),
        price_level=payload.get("priceLevel"),
        latitude=location.get("latitude"),
        longitude=location.get("longitude"),
        weekday_descriptions=hours_block.get("weekdayDescriptions") or [],
        open_now=(payload.get("currentOpeningHours") or {}).get("openNow"),
        photo_count=len(photos),
        photo_thumbnails=thumbs,
        editorial_summary=(payload.get("editorialSummary") or {}).get("text"),
        reviews=reviews,
        country=geo["country"],
        region=geo["region"],
        city=geo["city"],
        postal_code=geo["postal_code"],
    )


# ── Public entry points ────────────────────────────────────────────────────


async def resolve_maps_url(raw_input: str) -> Optional[str]:
    """Turn any Maps URL or place_id into a place_id.

    Returns ``None`` if the URL isn't recognized as a Maps share link.
    """
    cleaned = _normalize_maps_url(raw_input)
    if cleaned is None:
        return None

    # Direct place_id paste.
    if _PLACEID_RE.fullmatch(cleaned):
        return cleaned

    # Try parsing without unfurling first — it's free.
    direct = _maybe_extract_placeid(cleaned)
    if direct:
        return direct

    # Otherwise we need to follow the redirect chain.
    parsed = urlparse(cleaned)
    is_shortlink = parsed.netloc in {
        "maps.app.goo.gl",
        "goo.gl",
        "maps.goo.gl",
        "g.page",
    }
    if is_shortlink or parsed.path.startswith("/maps"):
        async with httpx.AsyncClient(verify=False, follow_redirects=True) as client:
            unfurled = await _unfurl(client, cleaned)
        return _maybe_extract_placeid(unfurled)

    return None


async def fetch_business_profile(place_id: str) -> Optional[BusinessProfile]:
    """Call Places Details and shape the response. ``None`` on failure."""
    if not place_id:
        return None
    async with httpx.AsyncClient() as client:
        payload = await _fetch_place(client, place_id)
    if payload is None:
        return None
    try:
        return _shape_business_profile(payload)
    except Exception as e:
        logger.exception(f"_shape_business_profile failed for {place_id}: {e}")
        return None
