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
* Just a business name + city pasted into the input.

Each of these has to be resolved to a canonical ``place_id`` before we can
hit the Places API for structured details. We do that here so the
qualification stack stays focused on signal extraction.

The Places API response is rich (~50 fields). We pass it through to the
``BusinessProfile`` Pydantic model below, which the audit endpoint then
serializes to the SPA.
"""
from __future__ import annotations

import re
from typing import Optional
from urllib.parse import unquote, urlparse, parse_qs

import httpx
from loguru import logger
from pydantic import BaseModel, Field

from app.config import get_settings
from app.core.network_security import safe_fetch
from app.modules.infrastructure import (
    Provider,
    UseCase,
    KeyExhaustedError,
    key_manager,
)


# ── Data shapes ────────────────────────────────────────────────────────────


class BusinessReview(BaseModel):
    author_name: Optional[str] = None
    author_uri: Optional[str] = None
    author_photo_uri: Optional[str] = None
    rating: Optional[int] = None
    relative_time: Optional[str] = None
    publish_time: Optional[str] = None
    text: Optional[str] = None
    original_text: Optional[str] = None


class AmenityFlags(BaseModel):
    """Boolean amenity / service flags Places API returns. ``None`` = not reported."""

    # Service options
    delivery: Optional[bool] = None
    takeout: Optional[bool] = None
    dine_in: Optional[bool] = None
    curbside_pickup: Optional[bool] = None
    reservable: Optional[bool] = None
    # Meal services
    serves_breakfast: Optional[bool] = None
    serves_lunch: Optional[bool] = None
    serves_dinner: Optional[bool] = None
    serves_brunch: Optional[bool] = None
    serves_beer: Optional[bool] = None
    serves_wine: Optional[bool] = None
    serves_cocktails: Optional[bool] = None
    serves_coffee: Optional[bool] = None
    serves_dessert: Optional[bool] = None
    serves_vegetarian_food: Optional[bool] = None
    # Audience / suitability
    good_for_children: Optional[bool] = None
    good_for_groups: Optional[bool] = None
    good_for_watching_sports: Optional[bool] = None
    allows_dogs: Optional[bool] = None
    live_music: Optional[bool] = None
    menu_for_children: Optional[bool] = None
    outdoor_seating: Optional[bool] = None
    restroom: Optional[bool] = None


class AccessibilityOptions(BaseModel):
    wheelchair_accessible_parking: Optional[bool] = None
    wheelchair_accessible_entrance: Optional[bool] = None
    wheelchair_accessible_restroom: Optional[bool] = None
    wheelchair_accessible_seating: Optional[bool] = None


class ParkingOptions(BaseModel):
    free_parking_lot: Optional[bool] = None
    paid_parking_lot: Optional[bool] = None
    free_street_parking: Optional[bool] = None
    paid_street_parking: Optional[bool] = None
    valet_parking: Optional[bool] = None
    free_garage_parking: Optional[bool] = None
    paid_garage_parking: Optional[bool] = None


class PaymentOptions(BaseModel):
    accepts_credit_cards: Optional[bool] = None
    accepts_debit_cards: Optional[bool] = None
    accepts_cash_only: Optional[bool] = None
    accepts_nfc: Optional[bool] = None


class BusinessProfile(BaseModel):
    """A subset of Places API ``Place`` shaped for the SPA.

    Mirrors as many fields as the v1 API exposes — see the field mask in
    ``_FIELD_MASK`` for the exact list of attributes we request.
    """

    place_id: str
    display_name: Optional[str] = None
    short_formatted_address: Optional[str] = None
    formatted_address: Optional[str] = None
    adr_format_address: Optional[str] = None
    primary_type: Optional[str] = None
    primary_type_raw: Optional[str] = None
    types: list[str] = Field(default_factory=list)
    phone: Optional[str] = None
    national_phone: Optional[str] = None
    international_phone: Optional[str] = None
    website_uri: Optional[str] = None
    google_maps_uri: Optional[str] = None
    place_uri: Optional[str] = None
    write_a_review_uri: Optional[str] = None
    rating: Optional[float] = None
    user_rating_count: Optional[int] = None
    business_status: Optional[str] = None  # OPERATIONAL, CLOSED_TEMPORARILY, ...
    price_level: Optional[str] = None
    price_range_start: Optional[str] = None
    price_range_end: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    viewport_low_lat: Optional[float] = None
    viewport_low_lng: Optional[float] = None
    viewport_high_lat: Optional[float] = None
    viewport_high_lng: Optional[float] = None
    plus_code_global: Optional[str] = None
    plus_code_compound: Optional[str] = None
    weekday_descriptions: list[str] = Field(default_factory=list)
    secondary_hours_descriptions: list[str] = Field(default_factory=list)
    open_now: Optional[bool] = None
    next_open_close_time: Optional[str] = None
    photo_count: int = 0
    photo_thumbnails: list[str] = Field(default_factory=list)
    photo_attributions: list[str] = Field(default_factory=list)
    editorial_summary: Optional[str] = None
    generative_summary: Optional[str] = None
    review_summary: Optional[str] = None
    area_summary: Optional[str] = None
    icon_mask_base_uri: Optional[str] = None
    icon_background_color: Optional[str] = None
    reviews: list[BusinessReview] = Field(default_factory=list)
    country: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    sublocality: Optional[str] = None
    route: Optional[str] = None
    street_number: Optional[str] = None
    postal_code: Optional[str] = None
    utc_offset_minutes: Optional[int] = None
    amenities: AmenityFlags = Field(default_factory=AmenityFlags)
    accessibility: AccessibilityOptions = Field(default_factory=AccessibilityOptions)
    parking: ParkingOptions = Field(default_factory=ParkingOptions)
    payments: PaymentOptions = Field(default_factory=PaymentOptions)
    sub_destinations: list[dict] = Field(default_factory=list)
    attributions: list[str] = Field(default_factory=list)
    pure_service_area_business: Optional[bool] = None


# ── URL parsing ────────────────────────────────────────────────────────────


# Regexes that pluck a Place ID from the various long-form URL shapes.
# ChIJ...-style IDs are 27 chars typically; we allow 20-50 to be safe.
_PLACEID_RE = re.compile(r"(ChIJ[\w\-]{15,80}|GhIJ[\w\-]{15,80}|EkIJ[\w\-]{15,80})")
# `!1s0x...` and `!1s<placeId>` patterns embedded in /maps/place/ URLs.
_DATA_PLACEID_RE = re.compile(r"!1s([\w\-:%]{8,120})")
# Hex feature ID pair (FTID): "0x89c259a9b3117469:0xd134e199a405a163".
_FTID_RE = re.compile(r"(0x[0-9a-f]{6,16}:0x[0-9a-f]{6,16})")
# Latitude/longitude block in /maps/place/<...>/@<lat>,<lng>,<zoom>z/...
_LATLNG_RE = re.compile(r"/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)")
# /maps/place/<URL-encoded-name>/... or /maps/search/<query>
_PLACE_NAME_RE = re.compile(r"/maps/(?:place|search|uv)/([^/]+)")
# Cid-only links use ``cid=<int>`` — also need a fallback pathway.
_CID_RE = re.compile(r"[?&!]cid=(\d{6,})")
# `q=<text>` query for plain text Maps searches.
_Q_RE = re.compile(r"[?&]q=([^&]+)")
# Path component for /maps/search/... when no q= param exists.
_SEARCH_PATH_RE = re.compile(r"/maps/search/([^/?]+)")


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
        if candidate.startswith(("ChIJ", "GhIJ", "EkIJ")):
            return candidate
        # If it looks like an FTID token (0x...:0x...), we can't return it
        # as a Place ID yet, but _maybe_extract_ftid will pick it up
        # for a search-fallback later.
    return None


def _maybe_extract_cid(url: str) -> Optional[str]:
    """Pull a numeric CID out of a Maps URL."""
    if not url:
        return None
    decoded = unquote(url)
    m = _CID_RE.search(decoded)
    return m.group(1) if m else None


def _maybe_extract_ftid(url: str) -> Optional[str]:
    """Pull a 0x...:0x... feature ID out of a long-form URL."""
    if not url:
        return None
    decoded = unquote(url)
    m = _FTID_RE.search(decoded)
    return m.group(1) if m else None


def _maybe_extract_latlng(url: str) -> Optional[tuple[float, float]]:
    if not url:
        return None
    m = _LATLNG_RE.search(url)
    if not m:
        return None
    try:
        return float(m.group(1)), float(m.group(2))
    except ValueError:
        return None


def _maybe_extract_place_name(url: str) -> Optional[str]:
    if not url:
        return None
    m = _PLACE_NAME_RE.search(url)
    if not m:
        return None
    name = unquote(m.group(1)).replace("+", " ").strip()
    # Strip the trailing data segment if Google packed extras in.
    name = re.split(r"[/@]", name, maxsplit=1)[0]
    return name or None


def _maybe_extract_search_query(url: str) -> Optional[str]:
    """``?q=Some+Cafe+City`` style links (rare but happen)."""
    if not url:
        return None
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    for key in ("q", "query"):
        if key in qs and qs[key]:
            text = unquote(qs[key][0]).replace("+", " ").strip()
            if text:
                return text
    m = _Q_RE.search(url)
    if m:
        return unquote(m.group(1)).replace("+", " ").strip() or None
    # Path fallback: /maps/search/Business+Name/...
    m = _SEARCH_PATH_RE.search(url)
    if m:
        return unquote(m.group(1)).replace("+", " ").strip() or None
    return None


# ── SSRF Safety ────────────────────────────────────────────────────────────


_ALLOWED_GOOGLE_DOMAINS = {
    "google.com",
    "www.google.com",
    "maps.google.com",
    "goo.gl",
    "maps.app.goo.gl",
    "g.page",
    "share.google",
    "google.co.in",  # Common regional variants
    "google.co.uk",
    "google.de",
    "google.fr",
    "google.it",
    "google.es",
    "google.co.jp",
}


async def _unfurl(client: httpx.AsyncClient, url: str) -> str:
    """Follow up to 5 redirects manually and return the final URL.

    SSRF mitigation: every hop is validated against a Google domain whitelist.
    Maps share links (``maps.app.goo.gl``, ``goo.gl/maps``) only resolve
    once you actually GET them.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    # Use centralized safe_fetch with Google domain whitelist
    resp, _ = await safe_fetch(
        client,
        url,
        method="HEAD",
        headers=headers,
        allowed_domains=_ALLOWED_GOOGLE_DOMAINS,
        max_redirects=5,
    )

    if not resp:
        # If HEAD failed (whitelist block or network error), return the original URL
        # which will likely fail extraction later anyway.
        return url

    # If it's a 200 but not a maps path, try a GET just in case (Maps behavior)
    # Some shortlinks resolve to a 200 "consent" or "loading" page before hitting /maps/
    if resp.status_code == 200 and "/maps/" not in str(resp.url):
        resp_get, _ = await safe_fetch(
            client,
            str(resp.url),
            method="GET",
            headers=headers,
            allowed_domains=_ALLOWED_GOOGLE_DOMAINS,
            max_redirects=0,  # Already resolved redirects
        )
        if resp_get:
            return str(resp_get.url)

    return str(resp.url)


def _normalize_maps_url(raw: str) -> Optional[str]:
    """Lowercase, trim, validate it looks like a Maps URL or shortlink."""
    raw = (raw or "").strip()
    if not raw:
        return None
    # If the user pasted a bare place_id, return as-is so the caller can shortcut.
    if _PLACEID_RE.fullmatch(raw):
        return raw
    if not raw.startswith(("http://", "https://")):
        # Could be a bare domain or just a name. We'll accept and let resolve
        # logic decide whether to treat as text search.
        if "/" in raw or "." in raw:
            raw = "https://" + raw
        else:
            # Pure text — return as-is so the resolver triggers text search.
            return raw
    parsed = urlparse(raw)
    if not parsed.netloc and not raw.startswith("http"):
        return None
    return raw


# ── Places API call ────────────────────────────────────────────────────────


_PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"
_PLACE_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText"

# Fields we ask Google for — keep this list tight; charges scale with bytes.
_FIELD_MASK = ",".join(
    [
        "id",
        "name",
        "displayName",
        "formattedAddress",
        "shortFormattedAddress",
        "adrFormatAddress",
        "addressComponents",
        "plusCode",
        "nationalPhoneNumber",
        "internationalPhoneNumber",
        "websiteUri",
        "googleMapsUri",
        "googleMapsLinks",
        "rating",
        "userRatingCount",
        "businessStatus",
        "priceLevel",
        "priceRange",
        "primaryType",
        "primaryTypeDisplayName",
        "types",
        "location",
        "viewport",
        "utcOffsetMinutes",
        "iconMaskBaseUri",
        "iconBackgroundColor",
        "currentOpeningHours.openNow",
        "currentOpeningHours.weekdayDescriptions",
        "currentOpeningHours.nextOpenTime",
        "currentOpeningHours.nextCloseTime",
        "regularOpeningHours.weekdayDescriptions",
        "regularSecondaryOpeningHours",
        "editorialSummary",
        "generativeSummary",
        "reviewSummary",
        "areaSummary",
        "photos",
        "reviews",
        "delivery",
        "takeout",
        "dineIn",
        "curbsidePickup",
        "reservable",
        "servesBreakfast",
        "servesLunch",
        "servesDinner",
        "servesBrunch",
        "servesBeer",
        "servesWine",
        "servesCocktails",
        "servesCoffee",
        "servesDessert",
        "servesVegetarianFood",
        "goodForChildren",
        "goodForGroups",
        "goodForWatchingSports",
        "allowsDogs",
        "liveMusic",
        "menuForChildren",
        "outdoorSeating",
        "restroom",
        "accessibilityOptions",
        "parkingOptions",
        "paymentOptions",
        "subDestinations",
        "attributions",
        "pureServiceAreaBusiness",
    ]
)

# Smaller mask for searchText resolution (we only need the place id; the
# follow-up fetchPlace call uses the full mask).
_SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location"


def _components_to_geo(components: list[dict]) -> dict:
    """Pull country / region / city / postal out of Google's addressComponents."""
    geo = {
        "country": None,
        "region": None,
        "city": None,
        "neighborhood": None,
        "sublocality": None,
        "route": None,
        "street_number": None,
        "postal_code": None,
    }
    for c in components or []:
        types = c.get("types") or []
        if "country" in types:
            geo["country"] = c.get("longText")
        elif "administrative_area_level_1" in types:
            geo["region"] = c.get("longText")
        elif "locality" in types or "postal_town" in types:
            geo["city"] = c.get("longText")
        elif "neighborhood" in types:
            geo["neighborhood"] = c.get("longText")
        elif "sublocality" in types or "sublocality_level_1" in types:
            geo["sublocality"] = c.get("longText")
        elif "route" in types:
            geo["route"] = c.get("longText")
        elif "street_number" in types:
            geo["street_number"] = c.get("longText")
        elif "postal_code" in types:
            geo["postal_code"] = c.get("longText")
    return geo


async def _fetch_place(client: httpx.AsyncClient, place_id: str) -> Optional[dict]:
    # The v1 API expects the resource path "places/<id>". When the caller
    # passes just the bare id we wrap it; if they already provided the
    # "places/<id>" form (e.g. from a search response) we keep it intact.
    if place_id.startswith("places/"):
        url = f"https://places.googleapis.com/v1/{place_id}"
    else:
        url = _PLACE_DETAILS_URL.format(place_id=place_id)

    tried_ids: set = set()
    for attempt in range(4):
        try:
            selected = await key_manager.get_best_key(
                Provider.GOOGLE_PLACES, UseCase.GENERAL
            )
        except KeyExhaustedError:
            logger.warning(f"Maps audit: no Google Places keys available for {place_id}")
            return None
        if selected.provider_id is not None and selected.provider_id in tried_ids:
            break
        if selected.provider_id is not None:
            tried_ids.add(selected.provider_id)
        headers = {
            "X-Goog-Api-Key": selected.api_key,
            "X-Goog-FieldMask": _FIELD_MASK,
            "Accept": "application/json",
        }
        try:
            resp = await client.get(url, headers=headers, timeout=12.0)
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code in (401, 403, 429):
                body = ""
                try:
                    body = resp.text[:300]
                except Exception:
                    pass
                logger.warning(f"Places API {resp.status_code} for {place_id}: {body}")
                quota_exc = type(
                    "PlacesQuotaError", (Exception,), {"status_code": resp.status_code}
                )(f"{resp.status_code}: {body[:120]}")
                await key_manager.mark_cooldown(selected.provider_id, quota_exc)
                continue
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
    return None


async def _searchtext_first(
    client: httpx.AsyncClient,
    text_query: str,
    location_bias: Optional[tuple[float, float]] = None,
) -> Optional[str]:
    """Run Places searchText and return the top match's place_id (no ``places/`` prefix).

    We use this as the universal fallback when the URL didn't directly contain
    a usable Place ID — for shortlinks that unfurl to FTID-only URLs, plain
    business names, ``cid`` links, etc.
    """
    if not text_query:
        return None
    body: dict = {"textQuery": text_query, "pageSize": 1}
    if location_bias:
        lat, lng = location_bias
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 5000.0,
            }
        }
    tried_ids: set = set()
    for attempt in range(4):
        try:
            selected = await key_manager.get_best_key(
                Provider.GOOGLE_PLACES, UseCase.DISCOVERY
            )
        except KeyExhaustedError:
            logger.warning("searchText: no Google Places keys available")
            return None
        if selected.provider_id is not None and selected.provider_id in tried_ids:
            break
        if selected.provider_id is not None:
            tried_ids.add(selected.provider_id)
        headers = {
            "X-Goog-Api-Key": selected.api_key,
            "X-Goog-FieldMask": _SEARCH_FIELD_MASK,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        try:
            resp = await client.post(
                _PLACE_SEARCH_TEXT_URL,
                headers=headers,
                json=body,
                timeout=10.0,
            )
            if resp.status_code in (401, 403, 429):
                logger.warning(
                    f"searchText {resp.status_code} for '{text_query[:80]}': {resp.text[:200]}"
                )
                quota_exc = type(
                    "PlacesQuotaError", (Exception,), {"status_code": resp.status_code}
                )(f"{resp.status_code}")
                await key_manager.mark_cooldown(selected.provider_id, quota_exc)
                continue
            if resp.status_code != 200:
                logger.warning(
                    f"searchText {resp.status_code} for '{text_query[:80]}': {resp.text[:200]}"
                )
                return None
            data = resp.json()
            places = data.get("places") or []
            if not places:
                return None
            candidate = places[0].get("id")
            return candidate or None
        except Exception as e:
            logger.exception(f"searchText request failed for '{text_query[:80]}': {e}")
            return None
    return None


def _photo_thumb(photo_resource: str, max_width: int = 600) -> str:
    """Build a v1 photo media URL the SPA can hot-link.

    The Places API returns ``photos[].name`` like ``places/<id>/photos/<id>``.
    The media endpoint uses that path and accepts a max dimension param. The
    ``X-Goog-Api-Key`` is sent as a query string here because <img> tags
    can't carry headers.

    Credential resolution order:
      1. First active row in the api_providers pool tagged
         ``provider_name=GOOGLE_PLACES``. We don't go through the async
         ``key_manager.get_best_key`` path because this builder is called
         from sync ``_shape_business_profile`` (and from inside a list
         comprehension); pulling the key inline lets the DB-only deploys
         work without making the entire shaper async.
      2. Legacy ``settings.GOOGLE_PLACES_API_KEY`` env var.
      3. Empty string — caller renders no image, never a broken URL.
    """
    if not photo_resource:
        return ""
    api_key = _photo_credential()
    if not api_key:
        return ""
    return (
        f"https://places.googleapis.com/v1/{photo_resource}/media?"
        f"maxHeightPx={max_width}&key={api_key}"
    )


def _photo_credential() -> str:
    """Return the best Google Places credential for media-thumbnail URLs.

    The lookup is cached for a short window because (a) media URLs are
    embedded into HTML and reused, so we don't want a different key on
    every comprehension iteration, and (b) the result is read-mostly.
    Cache invalidates every 5 minutes so a disabled key drops out.
    """
    import time
    cache = _photo_credential.__dict__
    now = time.time()
    if cache.get("_value") and (now - cache.get("_at", 0)) < 300:
        return cache["_value"]

    try:
        from app.core.database import get_session_maker
        from app.models.infrastructure import APIProvider
        from app.core.key_encryption import decrypt_api_key
        from sqlalchemy import select as _select

        # We're inside a sync function called from within an async stack —
        # so reuse the running loop instead of spawning a new one.
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Schedule a quick coroutine to fetch one active key; block via
            # ``run_coroutine_threadsafe`` only if we're somehow on a worker
            # thread, otherwise fall through to the env path. We cannot
            # await from a sync context.
            api_key = ""
        else:
            async def _fetch():
                async with get_session_maker()() as s:
                    row = (
                        await s.execute(
                            _select(APIProvider)
                            .where(
                                APIProvider.provider_name == "GOOGLE_PLACES",
                                APIProvider.is_active.is_(True),
                            )
                            .order_by(APIProvider.weight.desc())
                            .limit(1)
                        )
                    ).scalars().first()
                    return decrypt_api_key(row.encrypted_api_key) if row else ""
            api_key = loop.run_until_complete(_fetch())
    except Exception:
        api_key = ""

    if not api_key:
        api_key = getattr(get_settings(), "GOOGLE_PLACES_API_KEY", "") or ""

    cache["_value"] = api_key
    cache["_at"] = now
    return api_key


def _bool_or_none(payload: dict, key: str) -> Optional[bool]:
    """Return ``payload[key]`` if it's a real bool; ``None`` otherwise.

    The Places API often omits boolean attributes when not reported, in which
    case we want to preserve "unknown" rather than render it as a hard "no".
    """
    val = payload.get(key)
    return val if isinstance(val, bool) else None


def _shape_business_profile(payload: dict) -> BusinessProfile:
    """Map the Places API ``Place`` response into our ``BusinessProfile``."""
    geo = _components_to_geo(payload.get("addressComponents", []))
    location = payload.get("location") or {}
    viewport = payload.get("viewport") or {}
    plus_code = payload.get("plusCode") or {}

    photos = payload.get("photos") or []
    thumbs: list[str] = []
    photo_attributions: list[str] = []
    for p in photos[:12]:
        name = p.get("name")
        if name:
            url = _photo_thumb(name)
            if url:
                thumbs.append(url)
        for attr in (p.get("authorAttributions") or []):
            disp = attr.get("displayName")
            if disp and disp not in photo_attributions:
                photo_attributions.append(disp)

    reviews = []
    for r in (payload.get("reviews") or [])[:8]:
        attribution = r.get("authorAttribution") or {}
        text_block = (r.get("text") or {}).get("text")
        original_text_block = (r.get("originalText") or {}).get("text")
        reviews.append(
            BusinessReview(
                author_name=attribution.get("displayName"),
                author_uri=attribution.get("uri"),
                author_photo_uri=attribution.get("photoUri"),
                rating=r.get("rating"),
                relative_time=r.get("relativePublishTimeDescription"),
                publish_time=r.get("publishTime"),
                text=(text_block or "")[:1200] or None,
                original_text=(original_text_block or "")[:1200] or None,
            )
        )

    hours = payload.get("currentOpeningHours") or payload.get("regularOpeningHours") or {}
    secondary_hours = []
    for sh in (payload.get("regularSecondaryOpeningHours") or []):
        secondary_hours.extend(sh.get("weekdayDescriptions") or [])

    next_close = (payload.get("currentOpeningHours") or {}).get("nextCloseTime")
    next_open = (payload.get("currentOpeningHours") or {}).get("nextOpenTime")
    next_event = next_close or next_open

    price_range = payload.get("priceRange") or {}
    google_links = payload.get("googleMapsLinks") or {}

    accessibility_payload = payload.get("accessibilityOptions") or {}
    parking_payload = payload.get("parkingOptions") or {}
    payment_payload = payload.get("paymentOptions") or {}

    amenities = AmenityFlags(
        delivery=_bool_or_none(payload, "delivery"),
        takeout=_bool_or_none(payload, "takeout"),
        dine_in=_bool_or_none(payload, "dineIn"),
        curbside_pickup=_bool_or_none(payload, "curbsidePickup"),
        reservable=_bool_or_none(payload, "reservable"),
        serves_breakfast=_bool_or_none(payload, "servesBreakfast"),
        serves_lunch=_bool_or_none(payload, "servesLunch"),
        serves_dinner=_bool_or_none(payload, "servesDinner"),
        serves_brunch=_bool_or_none(payload, "servesBrunch"),
        serves_beer=_bool_or_none(payload, "servesBeer"),
        serves_wine=_bool_or_none(payload, "servesWine"),
        serves_cocktails=_bool_or_none(payload, "servesCocktails"),
        serves_coffee=_bool_or_none(payload, "servesCoffee"),
        serves_dessert=_bool_or_none(payload, "servesDessert"),
        serves_vegetarian_food=_bool_or_none(payload, "servesVegetarianFood"),
        good_for_children=_bool_or_none(payload, "goodForChildren"),
        good_for_groups=_bool_or_none(payload, "goodForGroups"),
        good_for_watching_sports=_bool_or_none(payload, "goodForWatchingSports"),
        allows_dogs=_bool_or_none(payload, "allowsDogs"),
        live_music=_bool_or_none(payload, "liveMusic"),
        menu_for_children=_bool_or_none(payload, "menuForChildren"),
        outdoor_seating=_bool_or_none(payload, "outdoorSeating"),
        restroom=_bool_or_none(payload, "restroom"),
    )
    accessibility = AccessibilityOptions(
        wheelchair_accessible_parking=_bool_or_none(
            accessibility_payload, "wheelchairAccessibleParking"
        ),
        wheelchair_accessible_entrance=_bool_or_none(
            accessibility_payload, "wheelchairAccessibleEntrance"
        ),
        wheelchair_accessible_restroom=_bool_or_none(
            accessibility_payload, "wheelchairAccessibleRestroom"
        ),
        wheelchair_accessible_seating=_bool_or_none(
            accessibility_payload, "wheelchairAccessibleSeating"
        ),
    )
    parking = ParkingOptions(
        free_parking_lot=_bool_or_none(parking_payload, "freeParkingLot"),
        paid_parking_lot=_bool_or_none(parking_payload, "paidParkingLot"),
        free_street_parking=_bool_or_none(parking_payload, "freeStreetParking"),
        paid_street_parking=_bool_or_none(parking_payload, "paidStreetParking"),
        valet_parking=_bool_or_none(parking_payload, "valetParking"),
        free_garage_parking=_bool_or_none(parking_payload, "freeGarageParking"),
        paid_garage_parking=_bool_or_none(parking_payload, "paidGarageParking"),
    )
    payments = PaymentOptions(
        accepts_credit_cards=_bool_or_none(payment_payload, "acceptsCreditCards"),
        accepts_debit_cards=_bool_or_none(payment_payload, "acceptsDebitCards"),
        accepts_cash_only=_bool_or_none(payment_payload, "acceptsCashOnly"),
        accepts_nfc=_bool_or_none(payment_payload, "acceptsNfc"),
    )

    place_uri = google_links.get("placeUri") or payload.get("googleMapsUri")
    write_review_uri = google_links.get("writeAReviewUri")

    return BusinessProfile(
        place_id=payload.get("id") or "",
        display_name=(payload.get("displayName") or {}).get("text"),
        short_formatted_address=payload.get("shortFormattedAddress"),
        formatted_address=payload.get("formattedAddress"),
        adr_format_address=payload.get("adrFormatAddress"),
        primary_type=(payload.get("primaryTypeDisplayName") or {}).get("text"),
        primary_type_raw=payload.get("primaryType"),
        types=payload.get("types") or [],
        phone=payload.get("internationalPhoneNumber") or payload.get("nationalPhoneNumber"),
        national_phone=payload.get("nationalPhoneNumber"),
        international_phone=payload.get("internationalPhoneNumber"),
        website_uri=payload.get("websiteUri"),
        google_maps_uri=payload.get("googleMapsUri"),
        place_uri=place_uri,
        write_a_review_uri=write_review_uri,
        rating=payload.get("rating"),
        user_rating_count=payload.get("userRatingCount"),
        business_status=payload.get("businessStatus"),
        price_level=payload.get("priceLevel"),
        price_range_start=(price_range.get("startPrice") or {}).get("units"),
        price_range_end=(price_range.get("endPrice") or {}).get("units"),
        latitude=location.get("latitude"),
        longitude=location.get("longitude"),
        viewport_low_lat=(viewport.get("low") or {}).get("latitude"),
        viewport_low_lng=(viewport.get("low") or {}).get("longitude"),
        viewport_high_lat=(viewport.get("high") or {}).get("latitude"),
        viewport_high_lng=(viewport.get("high") or {}).get("longitude"),
        plus_code_global=plus_code.get("globalCode"),
        plus_code_compound=plus_code.get("compoundCode"),
        weekday_descriptions=hours.get("weekdayDescriptions") or [],
        secondary_hours_descriptions=secondary_hours,
        open_now=(payload.get("currentOpeningHours") or {}).get("openNow"),
        next_open_close_time=next_event,
        photo_count=len(photos),
        photo_thumbnails=thumbs,
        photo_attributions=photo_attributions,
        editorial_summary=(payload.get("editorialSummary") or {}).get("text"),
        generative_summary=(payload.get("generativeSummary") or {}).get("overview", {}).get("text")
            or (payload.get("generativeSummary") or {}).get("description", {}).get("text"),
        review_summary=(payload.get("reviewSummary") or {}).get("text", {}).get("text"),
        area_summary=(payload.get("areaSummary") or {}).get("contentBlocks", [{}])[0].get("content", {}).get("text")
            if (payload.get("areaSummary") or {}).get("contentBlocks") else None,
        icon_mask_base_uri=payload.get("iconMaskBaseUri"),
        icon_background_color=payload.get("iconBackgroundColor"),
        reviews=reviews,
        country=geo["country"],
        region=geo["region"],
        city=geo["city"],
        neighborhood=geo["neighborhood"],
        sublocality=geo["sublocality"],
        route=geo["route"],
        street_number=geo["street_number"],
        postal_code=geo["postal_code"],
        utc_offset_minutes=payload.get("utcOffsetMinutes"),
        amenities=amenities,
        accessibility=accessibility,
        parking=parking,
        payments=payments,
        sub_destinations=payload.get("subDestinations") or [],
        attributions=payload.get("attributions") or [],
        pure_service_area_business=_bool_or_none(payload, "pureServiceAreaBusiness"),
    )


# ── Public entry points ────────────────────────────────────────────────────


async def resolve_maps_url(raw_input: str) -> Optional[str]:
    """Turn any Maps URL or place_id into a place_id.

    The resolver tries, in order:

    1. Raw place_id paste (``ChIJ...``).
    2. Direct extraction from the URL string (``!1s<placeid>``).
    3. URL unfurl (for shortlinks) → re-extract.
    4. searchText fallback using a name + lat/lng we pulled from the URL.
    5. searchText fallback using a free-text query from the URL.
    6. searchText fallback using the entire raw input as a text query.

    Returns ``None`` only when every strategy comes up empty.
    """
    cleaned = _normalize_maps_url(raw_input)
    if cleaned is None:
        return None

    # 1. Direct place_id paste.
    if _PLACEID_RE.fullmatch(cleaned):
        return cleaned

    # 2. Try parsing without unfurling first — it's free.
    direct = _maybe_extract_placeid(cleaned)
    if direct:
        return direct

    parsed = urlparse(cleaned)
    is_shortlink = parsed.netloc in {
        "maps.app.goo.gl",
        "goo.gl",
        "maps.goo.gl",
        "g.page",
        "share.google",
    }
    is_maps_url = bool(parsed.netloc) and "maps" in (parsed.netloc + parsed.path)

    async with httpx.AsyncClient(verify=True, follow_redirects=True) as client:
        # 3. Unfurl shortlinks and any Maps URL — rich places sometimes
        # only embed the full data block after a redirect.
        unfurled = cleaned
        if is_shortlink or is_maps_url:
            unfurled = await _unfurl(client, cleaned)
            direct = _maybe_extract_placeid(unfurled)
            if direct:
                return direct

        # 4. Try searchText with name + lat/lng if we can pull them out.
        place_name = _maybe_extract_place_name(unfurled) or _maybe_extract_place_name(cleaned)
        latlng = _maybe_extract_latlng(unfurled) or _maybe_extract_latlng(cleaned)
        if place_name:
            biased = await _searchtext_first(client, place_name, location_bias=latlng)
            if biased:
                return biased

        # 5. Try ``q=`` style query or search path component.
        q_text = _maybe_extract_search_query(unfurled) or _maybe_extract_search_query(cleaned)
        if q_text:
            biased = await _searchtext_first(client, q_text, location_bias=latlng)
            if biased:
                return biased

        # 6. Fallback: CID or FTID tokens in the URL.
        # While searchText (New) doesn't support these directly, searching
        # for them as text often yields the top match.
        cid = _maybe_extract_cid(unfurled) or _maybe_extract_cid(cleaned)
        if cid:
            res = await _searchtext_first(client, f"cid:{cid}")
            if res:
                return res
            # Try just the number
            res = await _searchtext_first(client, cid)
            if res:
                return res

        ftid = _maybe_extract_ftid(unfurled) or _maybe_extract_ftid(cleaned)
        if ftid:
            res = await _searchtext_first(client, ftid)
            if res:
                return res

        # 7. Final fallback — treat the whole raw string as a text query if
        # it doesn't look like a URL at all (bare business name pasted in).
        if not parsed.netloc and raw_input.strip():
            return await _searchtext_first(client, raw_input.strip())

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
