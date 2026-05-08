"""
Derived analytics for a Maps audit.

The Places API gives us raw business intel — rating, reviews, photos,
attributes — but turning that into "what should this owner actually do"
requires layered scoring. This module is the layer.

Everything here is pure (in/out only depends on the BusinessProfile + the
optional DeepAudit), so it stays cheap to call from the audit endpoint
and easy to unit-test.

Outputs
-------
* ``PlaceMetrics``  — numeric KPIs we want the SPA to chart.
* ``PlaceScorecard`` — five sub-scores + an overall local-presence score
  with a letter grade. Mirrors the website ``DeepAudit`` shape so the SPA
  can render both side-by-side.
* ``BenchmarkSnapshot`` — light context numbers (review benchmark for the
  category, percentile of star rating) so we can show "above average" /
  "below local pack threshold" tags.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

from pydantic import BaseModel, Field

from app.modules.qualification.deep_audit import DeepAudit
from app.modules.qualification.maps_resolver import (
    AmenityFlags,
    AccessibilityOptions,
    BusinessProfile,
    ParkingOptions,
    PaymentOptions,
)


# ── Data shapes ────────────────────────────────────────────────────────────


class PlaceMetrics(BaseModel):
    """Numeric KPIs derived from the BusinessProfile."""

    profile_completeness_pct: int = Field(..., ge=0, le=100)
    nap_completeness_pct: int = Field(..., ge=0, le=100)
    photo_coverage_pct: int = Field(..., ge=0, le=100)
    amenity_disclosure_pct: int = Field(..., ge=0, le=100)
    accessibility_disclosure_pct: int = Field(..., ge=0, le=100)
    review_response_rate_pct: Optional[int] = Field(None, ge=0, le=100)
    avg_review_length_chars: int = Field(..., ge=0)
    days_since_latest_review: Optional[int] = None
    days_since_oldest_review: Optional[int] = None
    estimated_review_velocity_per_month: float = Field(..., ge=0)
    rating_percentile_estimate: Optional[int] = Field(None, ge=0, le=100)
    local_pack_eligible: bool
    is_top_rated: bool
    is_low_rated: bool
    is_new_listing: bool
    sentiment_proxy_pct: int = Field(..., ge=0, le=100)


class CategoryScore(BaseModel):
    category: str
    score: int = Field(..., ge=0, le=100)
    headline: str
    detail: str


class PlaceScorecard(BaseModel):
    overall_score: int = Field(..., ge=0, le=100)
    grade: str = Field(..., pattern=r"^(A\+|A|B|C|D|F)$")
    summary: str
    categories: list[CategoryScore]


class BenchmarkSnapshot(BaseModel):
    category_label: str
    review_benchmark: int = Field(..., description="Reviews-needed baseline for this category to be local-pack eligible.")
    star_benchmark: float = Field(..., description="Average rating that signals 'above-average' for the type.")
    review_gap: int = Field(..., description="Reviews still needed to reach the benchmark; 0 if already there.")
    star_gap: float = Field(..., description="Stars still needed to reach the benchmark; 0 if already there.")


# ── Helpers ────────────────────────────────────────────────────────────────


_GRADE_BANDS = [
    (90, "A+"),
    (80, "A"),
    (70, "B"),
    (60, "C"),
    (50, "D"),
    (0, "F"),
]


def _grade_for(score: int) -> str:
    for threshold, grade in _GRADE_BANDS:
        if score >= threshold:
            return grade
    return "F"


def _disclosure_pct(values: Iterable[Optional[bool]]) -> int:
    items = list(values)
    if not items:
        return 0
    known = sum(1 for v in items if v is not None)
    return int(round(100 * known / len(items)))


def _amenity_flags_disclosure(amenities: AmenityFlags) -> int:
    return _disclosure_pct(amenities.model_dump().values())


def _accessibility_disclosure(opts: AccessibilityOptions) -> int:
    return _disclosure_pct(opts.model_dump().values())


def _parking_disclosure(opts: ParkingOptions) -> int:
    return _disclosure_pct(opts.model_dump().values())


def _payment_disclosure(opts: PaymentOptions) -> int:
    return _disclosure_pct(opts.model_dump().values())


def _profile_completeness(profile: BusinessProfile) -> int:
    """How complete the GBP listing is, on a 0-100 scale.

    Weighted across the high-leverage fields. Disclosure of yes/no
    attributes counts but is capped so a "no" answer everywhere doesn't
    inflate the score.
    """
    score = 0
    score += 12 if profile.display_name else 0
    score += 8 if profile.formatted_address else 0
    score += 6 if profile.phone else 0
    score += 10 if profile.website_uri else 0
    score += 6 if profile.weekday_descriptions else 0
    score += 6 if profile.editorial_summary else 0
    score += 4 if profile.generative_summary else 0
    score += 4 if profile.review_summary else 0
    score += 6 if profile.photo_count >= 5 else (3 if profile.photo_count > 0 else 0)
    score += 6 if profile.photo_count >= 15 else 0
    score += 4 if profile.types else 0
    score += 4 if profile.user_rating_count and profile.user_rating_count >= 25 else 0
    score += 4 if profile.user_rating_count and profile.user_rating_count >= 100 else 0
    score += 6 if profile.rating and profile.rating >= 4.0 else 0
    score += 4 if profile.plus_code_global else 0

    # Attribute disclosure pulls the rest of the way; capped at 10 pts.
    disclosure_avg = (
        _amenity_flags_disclosure(profile.amenities)
        + _accessibility_disclosure(profile.accessibility)
        + _parking_disclosure(profile.parking)
        + _payment_disclosure(profile.payments)
    ) / 4
    score += int(round(disclosure_avg * 0.10))
    return max(0, min(100, score))


def _nap_score(profile: BusinessProfile) -> int:
    """Name-Address-Phone consistency proxy. We don't crawl directories
    here, but we can score how much of the canonical NAP block is present
    on the listing itself. Weighted toward street-level address detail.
    """
    score = 0
    if profile.display_name:
        score += 25
    if profile.formatted_address:
        score += 25
    if profile.route or profile.street_number:
        score += 15
    if profile.city or profile.sublocality:
        score += 10
    if profile.region:
        score += 5
    if profile.postal_code:
        score += 5
    if profile.phone:
        score += 15
    return max(0, min(100, score))


def _photo_coverage(profile: BusinessProfile) -> int:
    """Rough photo coverage. 30 photos is treated as "saturated"."""
    if profile.photo_count <= 0:
        return 0
    pct = int(round(100 * profile.photo_count / 30))
    return min(100, pct)


def _avg_review_length(profile: BusinessProfile) -> int:
    if not profile.reviews:
        return 0
    lengths = [len((r.text or "")) for r in profile.reviews]
    if not lengths:
        return 0
    return int(round(sum(lengths) / len(lengths)))


def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        # Places API returns RFC3339 with trailing 'Z' — Python's fromisoformat
        # only accepts that suffix on 3.11+. Fall back manually otherwise.
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _review_velocity(profile: BusinessProfile) -> tuple[float, Optional[int], Optional[int]]:
    """Return (reviews/month estimate, days since latest, days since oldest).

    The Places API caps returned reviews at five — sample-size is small.
    We use the spread of those reviews to estimate the cadence.
    """
    if not profile.reviews:
        return 0.0, None, None
    timestamps = sorted(
        [t for t in (_parse_iso(r.publish_time) for r in profile.reviews) if t is not None]
    )
    if not timestamps:
        return 0.0, None, None
    now = datetime.now(timezone.utc)
    latest = timestamps[-1]
    oldest = timestamps[0]
    days_since_latest = max(0, (now - latest).days)
    days_since_oldest = max(0, (now - oldest).days)
    if len(timestamps) < 2 or days_since_oldest <= 0:
        # Single review or all reviews on the same day — fall back to total
        # rating count over the listing's apparent age if possible.
        if profile.user_rating_count and days_since_oldest:
            return (
                round(profile.user_rating_count / max(1, days_since_oldest / 30), 2),
                days_since_latest,
                days_since_oldest,
            )
        return 0.0, days_since_latest, days_since_oldest
    span_days = (timestamps[-1] - timestamps[0]).days or 1
    velocity = round(((len(timestamps) - 1) / span_days) * 30, 2)
    return velocity, days_since_latest, days_since_oldest


def _rating_percentile(profile: BusinessProfile) -> Optional[int]:
    """Coarse percentile bucket for a star rating.

    These are industry-standard local-listing distributions: 4.5+ ≈ top 10%,
    4.0+ ≈ top quartile, etc. Good enough for "above/below" labelling.
    """
    rating = profile.rating
    if rating is None:
        return None
    if rating >= 4.7:
        return 95
    if rating >= 4.5:
        return 85
    if rating >= 4.2:
        return 70
    if rating >= 4.0:
        return 55
    if rating >= 3.8:
        return 40
    if rating >= 3.5:
        return 25
    return 10


def _sentiment_proxy(profile: BusinessProfile) -> int:
    """Crude sentiment signal: mean of rating + share of 4-5 star recent reviews.

    With at most five sample reviews from the API, this is a *rough* proxy
    rather than a real sentiment classifier. Useful for showing "looks
    healthy / looks rough" rather than for absolute claims.
    """
    base = (profile.rating or 0) / 5.0
    if profile.reviews:
        good = sum(1 for r in profile.reviews if (r.rating or 0) >= 4)
        share = good / len(profile.reviews)
    else:
        share = base
    return int(round(((base * 0.6) + (share * 0.4)) * 100))


def _category_label(profile: BusinessProfile) -> str:
    if profile.primary_type:
        return profile.primary_type
    if profile.types:
        return profile.types[0].replace("_", " ").title()
    return "business"


def _benchmark_for(profile: BusinessProfile) -> BenchmarkSnapshot:
    label = _category_label(profile)
    types = {t.lower() for t in profile.types}
    review_benchmark = 50
    star_benchmark = 4.3
    if types & {"restaurant", "bar", "cafe", "bakery", "meal_takeaway", "meal_delivery", "food"}:
        review_benchmark = 100
        star_benchmark = 4.4
    elif types & {"lawyer", "doctor", "dentist", "physiotherapist", "accountant"}:
        review_benchmark = 30
        star_benchmark = 4.6
    elif types & {"hotel", "lodging", "resort"}:
        review_benchmark = 200
        star_benchmark = 4.2
    elif types & {"gym", "spa", "beauty_salon", "hair_care"}:
        review_benchmark = 60
        star_benchmark = 4.5
    elif types & {"car_repair", "car_dealer", "moving_company", "plumber", "electrician"}:
        review_benchmark = 40
        star_benchmark = 4.5
    elif types & {"store", "clothing_store", "supermarket", "convenience_store"}:
        review_benchmark = 80
        star_benchmark = 4.3
    elif types & {"school", "primary_school", "secondary_school", "university"}:
        review_benchmark = 30
        star_benchmark = 4.0

    review_gap = max(0, review_benchmark - (profile.user_rating_count or 0))
    star_gap = max(0.0, round(star_benchmark - (profile.rating or 0), 2))
    return BenchmarkSnapshot(
        category_label=label,
        review_benchmark=review_benchmark,
        star_benchmark=star_benchmark,
        review_gap=review_gap,
        star_gap=star_gap,
    )


# ── Top-level entry point ──────────────────────────────────────────────────


def compute_metrics(profile: BusinessProfile) -> PlaceMetrics:
    velocity, days_since_latest, days_since_oldest = _review_velocity(profile)
    profile_pct = _profile_completeness(profile)
    nap_pct = _nap_score(profile)
    photo_pct = _photo_coverage(profile)
    amenity_pct = _amenity_flags_disclosure(profile.amenities)
    a11y_pct = _accessibility_disclosure(profile.accessibility)
    return PlaceMetrics(
        profile_completeness_pct=profile_pct,
        nap_completeness_pct=nap_pct,
        photo_coverage_pct=photo_pct,
        amenity_disclosure_pct=amenity_pct,
        accessibility_disclosure_pct=a11y_pct,
        review_response_rate_pct=None,  # Places API v1 no longer exposes ownerResponses
        avg_review_length_chars=_avg_review_length(profile),
        days_since_latest_review=days_since_latest,
        days_since_oldest_review=days_since_oldest,
        estimated_review_velocity_per_month=velocity,
        rating_percentile_estimate=_rating_percentile(profile),
        local_pack_eligible=(
            profile.business_status == "OPERATIONAL"
            and bool(profile.formatted_address)
            and (profile.user_rating_count or 0) >= 25
            and (profile.rating or 0) >= 4.0
        ),
        is_top_rated=(profile.rating or 0) >= 4.5 and (profile.user_rating_count or 0) >= 50,
        is_low_rated=(profile.rating or 0) > 0 and (profile.rating or 0) < 4.0,
        is_new_listing=(profile.user_rating_count or 0) < 10,
        sentiment_proxy_pct=_sentiment_proxy(profile),
    )


def compute_scorecard(
    profile: BusinessProfile,
    metrics: PlaceMetrics,
    website_audit: Optional[DeepAudit],
) -> PlaceScorecard:
    """Five categories that map to actionable owner work:
    Reviews, Profile, Photos, Engagement, Discoverability.
    """
    categories: list[CategoryScore] = []

    # Reviews: rating + count + velocity
    reviews_score = 0
    rating = profile.rating or 0
    count = profile.user_rating_count or 0
    if rating >= 4.5:
        reviews_score += 45
    elif rating >= 4.0:
        reviews_score += 30
    elif rating >= 3.5:
        reviews_score += 15
    if count >= 200:
        reviews_score += 35
    elif count >= 100:
        reviews_score += 28
    elif count >= 50:
        reviews_score += 20
    elif count >= 25:
        reviews_score += 12
    elif count >= 10:
        reviews_score += 6
    if metrics.estimated_review_velocity_per_month >= 5:
        reviews_score += 20
    elif metrics.estimated_review_velocity_per_month >= 2:
        reviews_score += 12
    elif metrics.estimated_review_velocity_per_month >= 1:
        reviews_score += 6
    reviews_score = min(100, reviews_score)
    categories.append(
        CategoryScore(
            category="reviews",
            score=reviews_score,
            headline=f"{rating:.1f}★ ({count:,} reviews)" if count else "No reviews yet",
            detail=(
                f"~{metrics.estimated_review_velocity_per_month:.1f} reviews/month "
                f"based on the public sample."
            ),
        )
    )

    # Profile completeness
    profile_score = metrics.profile_completeness_pct
    headline_bits = []
    if not profile.website_uri:
        headline_bits.append("no website")
    if not profile.editorial_summary and not profile.generative_summary:
        headline_bits.append("no description")
    if not profile.weekday_descriptions:
        headline_bits.append("no hours")
    headline = ", ".join(headline_bits) or "fields look populated"
    categories.append(
        CategoryScore(
            category="profile",
            score=profile_score,
            headline=f"Listing completeness {profile_score}/100",
            detail=f"Gaps: {headline}.",
        )
    )

    # Photos
    photo_score = metrics.photo_coverage_pct
    photo_detail = (
        "10+ photos drive ~35% more clicks than thin listings."
        if profile.photo_count < 10
        else "Strong photo set — keep refreshing seasonally."
    )
    categories.append(
        CategoryScore(
            category="photos",
            score=photo_score,
            headline=f"{profile.photo_count} photos on Google",
            detail=photo_detail,
        )
    )

    # Engagement / hospitality (responses, attributes, sentiment)
    engagement_score = int(round(
        0.4 * metrics.amenity_disclosure_pct
        + 0.3 * metrics.accessibility_disclosure_pct
        + 0.3 * metrics.sentiment_proxy_pct
    ))
    categories.append(
        CategoryScore(
            category="engagement",
            score=engagement_score,
            headline=f"Sentiment proxy {metrics.sentiment_proxy_pct}/100",
            detail=(
                f"Amenity disclosure {metrics.amenity_disclosure_pct}% · "
                f"accessibility disclosure {metrics.accessibility_disclosure_pct}%."
            ),
        )
    )

    # Discoverability — website audit grade folds in here so a strong site
    # lifts overall, and a missing/dead site drags it down.
    if website_audit:
        site_score = website_audit.overall_score
        site_headline = f"Website {website_audit.grade} ({site_score}/100)"
    elif profile.website_uri:
        site_score = 25
        site_headline = "Listed website unreachable"
    else:
        site_score = 0
        site_headline = "No website on the listing"
    nap_score = metrics.nap_completeness_pct
    discoverability = int(round(0.55 * site_score + 0.45 * nap_score))
    categories.append(
        CategoryScore(
            category="discoverability",
            score=discoverability,
            headline=site_headline,
            detail=f"NAP completeness {nap_score}/100.",
        )
    )

    weights = {"reviews": 0.30, "profile": 0.20, "photos": 0.10, "engagement": 0.15, "discoverability": 0.25}
    overall = int(round(sum(c.score * weights[c.category] for c in categories)))
    if profile.business_status and profile.business_status != "OPERATIONAL":
        overall = min(overall, 40)
    grade = _grade_for(overall)
    summary_map = {
        "A+": "World-class local presence — keep pushing reviews and content.",
        "A": "Strong listing. A couple of targeted moves take you above local competitors.",
        "B": "Solid foundation. Address the warnings in priority order to win the local pack.",
        "C": "Mixed performance. Several high-impact gaps are blocking discovery — start with reviews.",
        "D": "Significant gaps. Fix profile fundamentals + reviews before any paid spend.",
        "F": "Major issues. Most local searches are skipping this listing entirely.",
    }
    return PlaceScorecard(
        overall_score=overall,
        grade=grade,
        summary=summary_map[grade],
        categories=categories,
    )


def compute_benchmark(profile: BusinessProfile) -> BenchmarkSnapshot:
    return _benchmark_for(profile)
