"""
Maps audit endpoint (Pro / Enterprise only).

The Google Maps place audit is the most expensive scanner we run — every
call burns a paid Places Details request plus the deep website audit on
the listed website. Locking it behind a paid plan keeps the unit
economics sane and matches the user-facing pricing.

Auth model
----------
The route lives on the *private* router so the standard ``X-API-Key`` is
already enforced at the framework layer. We then layer:

* ``Depends(get_current_user)`` — Bearer JWT (Supabase or legacy) must
  resolve to a real, active user.
* In-handler plan check against ``user.plan`` and ``user.plan_expires_at``
  — superusers bypass the gate (so we can demo the feature on stage
  without provisioning a plan), but regular accounts must have an
  active ``pro`` or ``enterprise`` subscription.

The website-only audit (``/api/v1/public/audit-website``) stays free and
anonymous — it's the lead magnet. Only the Maps endpoint is gated.

Note: we deliberately avoid ``from __future__ import annotations`` here.
slowapi's ``@limiter.limit`` decorator wraps the handler in a way that
forces FastAPI to re-resolve type hints for the request model, and
PEP 563 string-form annotations confuse Pydantic's forward-ref
resolution under that wrapping (same constraint as ``public.py``).
"""
import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from loguru import logger
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.models.user import User
from app.modules.qualification.deep_audit import DeepAudit, Finding, run_deep_audit
from app.modules.qualification.maps_resolver import (
    BusinessProfile,
    fetch_business_profile,
    resolve_maps_url,
)
from app.modules.qualification.place_analytics import (
    BenchmarkSnapshot,
    PlaceMetrics,
    PlaceScorecard,
    compute_benchmark,
    compute_metrics,
    compute_scorecard,
)
from app.modules.qualification.social_checker import check_social_media


router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────


class MapsAuditRequest(BaseModel):
    maps_url: str = Field(
        ...,
        min_length=2,
        max_length=2048,
        description=(
            "A Google Maps share URL, long URL, raw Place ID, or even a "
            "business name + city. We resolve to the place ID via the "
            "Places API and run the full audit + analytics."
        ),
    )


class ScanSocial(BaseModel):
    platform: str
    url: str


class DerivedRecommendation(BaseModel):
    code: str
    title: str
    detail: str
    priority: str = Field(..., pattern=r"^(high|medium|low)$")


class MapsAuditResponse(BaseModel):
    place_id: str
    fetched_at_iso: str
    business: BusinessProfile
    website_audit: Optional[DeepAudit]
    socials_found: bool
    socials: list[ScanSocial]
    derived_findings: list[Finding]
    recommendations: list[DerivedRecommendation]
    metrics: PlaceMetrics
    scorecard: PlaceScorecard
    benchmark: BenchmarkSnapshot


# ── Plan gating ───────────────────────────────────────────────────────────


_PAID_PLANS = {"pro", "enterprise"}


def _has_active_paid_plan(user: User) -> bool:
    """Returns True iff the user is a superuser or has an unexpired paid plan."""
    if user.is_superuser:
        return True
    plan = (user.plan or "").lower()
    if plan not in _PAID_PLANS:
        return False
    expires_at = user.plan_expires_at
    if expires_at is None:
        # No expiry recorded — historical accounts that were upgraded
        # manually fall through here. We allow access; the billing
        # webhook is responsible for setting an expiry on real subs.
        return True
    # ``plan_expires_at`` is timezone-aware in our model; compare in UTC.
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > now


def require_paid_plan(current_user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency: 402 if the caller doesn't have a paid plan."""
    if not _has_active_paid_plan(current_user):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "The Google Maps audit is a Pro / Enterprise feature. "
                "Upgrade your plan to run unlimited place audits."
            ),
        )
    return current_user


# ── Recommendation builder ────────────────────────────────────────────────


def _maps_recommendations(
    *,
    business: BusinessProfile,
    website_audit: Optional[DeepAudit],
    metrics: PlaceMetrics,
) -> tuple[list[Finding], list[DerivedRecommendation]]:
    """Generate Maps-specific findings and high-level marketing advice.

    Pure analysis over the BusinessProfile + computed metrics. Website
    findings are already inside ``website_audit.findings``; we add the
    *additional* signals that come from having Maps data we wouldn't get
    from a website-only scan.
    """
    findings: list[Finding] = []
    recs: list[DerivedRecommendation] = []

    if business.business_status and business.business_status != "OPERATIONAL":
        findings.append(
            Finding(
                category="trust",
                code="maps_status_not_operational",
                title=f"Business status: {business.business_status.replace('_', ' ').title()}",
                detail=(
                    "Google has flagged this listing as non-operational. New "
                    "customers will see a warning before they ever click through."
                ),
                suggestion="Re-verify your listing in Google Business Profile and update operating status.",
                severity="critical",
                impact="high",
            )
        )

    if not business.website_uri:
        findings.append(
            Finding(
                category="trust",
                code="maps_no_website",
                title="No website on Google Business Profile",
                detail=(
                    "Listings without a website convert ~50% worse than those with "
                    "one. Even a single landing page outperforms 'no website' for "
                    "trust and SEO juice."
                ),
                suggestion=(
                    "Publish at least a 1-page site with hours, services, and a "
                    "contact form, then add it to your Google Business Profile."
                ),
                severity="warning",
                impact="high",
            )
        )
        recs.append(
            DerivedRecommendation(
                code="rec_publish_website",
                title="Publish a basic website",
                detail=(
                    "Even a single-page Carrd / Wix site lifts conversion and "
                    "lets us run a full SEO audit next time."
                ),
                priority="high",
            )
        )

    if business.user_rating_count is not None:
        if business.user_rating_count < 25:
            findings.append(
                Finding(
                    category="trust",
                    code="maps_low_review_count",
                    title=f"Only {business.user_rating_count} Google reviews",
                    detail=(
                        "Listings with <25 reviews rank below better-reviewed "
                        "competitors in 'near me' results."
                    ),
                    suggestion="Send a polite review-request to your last 50 happy customers via email or WhatsApp.",
                    severity="warning",
                    impact="high",
                )
            )
            recs.append(
                DerivedRecommendation(
                    code="rec_review_request_campaign",
                    title="Run a 30-day review request drive",
                    detail="Aim for +20 reviews this month — biggest single lift to local pack ranking.",
                    priority="high",
                )
            )

    if (
        business.rating is not None
        and business.rating < 4.0
        and (business.user_rating_count or 0) >= 10
    ):
        findings.append(
            Finding(
                category="trust",
                code="maps_low_rating",
                title=f"Average rating is {business.rating:.1f}",
                detail=(
                    "Below 4.0 is a hard discovery cap — most consumers filter "
                    "to 4-stars-and-up, especially in the Google local pack."
                ),
                suggestion="Audit recent 1–3 star reviews, respond publicly, and fix the operational root cause.",
                severity="critical",
                impact="high",
            )
        )

    if business.photo_count < 5:
        findings.append(
            Finding(
                category="trust",
                code="maps_few_photos",
                title=f"Only {business.photo_count} photo(s) on Google",
                detail=(
                    "Listings with 10+ photos receive ~35% more clicks. Mobile "
                    "users skim photos before reading anything else."
                ),
                suggestion="Upload 10+ high-resolution photos: storefront, interior, products/services, team.",
                severity="warning",
                impact="medium",
            )
        )
        recs.append(
            DerivedRecommendation(
                code="rec_upload_photos",
                title="Upload 10+ business photos",
                detail="Photos are the single strongest engagement lever on a Google Business Profile.",
                priority="medium",
            )
        )

    if not business.weekday_descriptions:
        findings.append(
            Finding(
                category="trust",
                code="maps_no_hours",
                title="Operating hours not set",
                detail=(
                    "Listings without hours don't show 'Open now' on mobile and "
                    "drop out of 'open now' filtered searches."
                ),
                suggestion="Set accurate weekly hours in Google Business Profile, including holiday exceptions.",
                severity="warning",
                impact="medium",
            )
        )

    if (
        not business.editorial_summary
        and not business.generative_summary
        and (business.user_rating_count or 0) > 50
    ):
        findings.append(
            Finding(
                category="aeo",
                code="maps_no_editorial",
                title="No description on the Google listing",
                detail=(
                    "A descriptive 'about' section helps Google's editorial / "
                    "generative summary surfaces and feeds answer-engine citations."
                ),
                suggestion="Write a 250–500 char description focused on services, neighbourhood, and unique selling points.",
                severity="info",
                impact="medium",
            )
        )

    if metrics.amenity_disclosure_pct < 20:
        findings.append(
            Finding(
                category="trust",
                code="maps_low_amenity_disclosure",
                title="Most attributes are unanswered",
                detail=(
                    "Google ranks listings with rich attribute disclosure higher "
                    "in filtered searches (e.g. 'wheelchair accessible', "
                    "'outdoor seating', 'serves vegetarian')."
                ),
                suggestion="Open Google Business Profile → Edit profile → Attributes; answer every relevant question.",
                severity="warning",
                impact="medium",
            )
        )
        recs.append(
            DerivedRecommendation(
                code="rec_fill_attributes",
                title="Fill out every Maps attribute",
                detail="Each attribute ('outdoor seating', 'free parking', etc.) unlocks a filter Google uses to narrow searches.",
                priority="medium",
            )
        )

    if metrics.accessibility_disclosure_pct == 0:
        findings.append(
            Finding(
                category="accessibility",
                code="maps_no_accessibility",
                title="No accessibility attributes set",
                detail=(
                    "Wheelchair accessibility info is one of the most-checked "
                    "attributes — leaving it blank pushes the listing out of "
                    "accessibility-filtered searches entirely."
                ),
                suggestion="Set the wheelchair accessible parking / entrance / restroom / seating attributes.",
                severity="warning",
                impact="medium",
            )
        )

    if metrics.is_low_rated:
        recs.append(
            DerivedRecommendation(
                code="rec_recover_rating",
                title="Run a rating recovery sprint",
                detail=(
                    "Reply to every <4-star review publicly with a fix. Then "
                    "ask 30 happy customers for a fresh review to dilute legacy noise."
                ),
                priority="high",
            )
        )
    elif metrics.estimated_review_velocity_per_month < 1 and (business.user_rating_count or 0) > 0:
        recs.append(
            DerivedRecommendation(
                code="rec_review_drip",
                title="Set up a monthly review-request drip",
                detail="Stale review velocity signals a stale business. Aim for ≥4 reviews/month.",
                priority="medium",
            )
        )

    if not metrics.local_pack_eligible and business.business_status == "OPERATIONAL":
        recs.append(
            DerivedRecommendation(
                code="rec_local_pack",
                title="Push to Google local pack eligibility",
                detail=(
                    "You currently miss the local-pack threshold (4.0★ + 25 reviews). "
                    "Closing that gap typically 3-5x's organic call volume in 60 days."
                ),
                priority="high",
            )
        )

    # Website-derived recommendations.
    if website_audit:
        if website_audit.overall_score < 60:
            recs.append(
                DerivedRecommendation(
                    code="rec_website_overhaul",
                    title="Schedule a website overhaul",
                    detail=(
                        "Your website scored under 60. The fastest path is a template-based "
                        "rebuild that addresses indexability + meta + schema in one pass."
                    ),
                    priority="high",
                )
            )
        elif website_audit.overall_score < 80:
            recs.append(
                DerivedRecommendation(
                    code="rec_website_polish",
                    title="Targeted website improvements",
                    detail=(
                        "Knock out the warning-level findings on your audit page in priority order — "
                        "you can move from B to A in a single sprint."
                    ),
                    priority="medium",
                )
            )

        if not any(
            f.category == "schema" and "incomplete" not in f.code
            for f in website_audit.findings
        ):
            recs.append(
                DerivedRecommendation(
                    code="rec_add_localbusiness_schema",
                    title="Add LocalBusiness JSON-LD",
                    detail=(
                        "Pair your Google Business Profile with on-site LocalBusiness schema "
                        "containing your NAP, hours, and rating — major lift for local pack visibility."
                    ),
                    priority="high",
                )
            )

    if business.website_uri and not website_audit:
        # Website crawl failed — surface that clearly to the visitor.
        findings.append(
            Finding(
                category="indexability",
                code="website_unreachable",
                title="Listed website did not respond",
                detail=(
                    f"Google has '{business.website_uri}' as your website but our audit "
                    "could not load it. Customers clicking 'Website' on Maps see the same."
                ),
                suggestion="Verify the website URL is correct in Google Business Profile and confirm the site is live.",
                severity="critical",
                impact="high",
            )
        )

    return findings, recs


# ── Routes ────────────────────────────────────────────────────────────────


@router.post(
    "/audit/place",
    response_model=MapsAuditResponse,
    summary="Resolve a Google Maps URL → full business intel + analytics + website audit",
    tags=["audit"],
)
@limiter.limit("20/minute")
async def audit_place(
    payload: MapsAuditRequest,
    request: Request,
    response: Response,
    current_user: User = Depends(require_paid_plan),
) -> MapsAuditResponse:
    """Pro/Enterprise audit: resolves any Maps URL and returns the full
    place profile, derived analytics, computed scorecard, plus the deep
    website audit on the listed website (when present).

    Cost notes:
      - One Places Details call (~$0.005 / request).
      - Optional Places searchText fallback when the URL doesn't carry a
        place ID directly (~$0.005 / fallback).
      - The website audit cost only fires if the listing has a website.
    """
    _ = response  # injected for slowapi headers
    _ = current_user  # gate enforced via dependency

    place_id = await resolve_maps_url(payload.maps_url)
    if not place_id:
        raise HTTPException(
            status_code=422,
            detail=(
                "Couldn't resolve a Google Place from that input. Open the place "
                "in Google Maps, click Share → Copy link, and paste the link — "
                "or paste the business name and city instead."
            ),
        )

    business = await fetch_business_profile(place_id)
    if business is None:
        raise HTTPException(
            status_code=502,
            detail=(
                "Found the place but the Places API didn't return details. "
                "Try again in a moment."
            ),
        )

    website_audit: Optional[DeepAudit] = None
    socials_found = False
    socials: list[dict] = []
    if business.website_uri:
        # Run the website audit and the social check concurrently — they
        # both fetch the same homepage but ``return_exceptions`` keeps one
        # failing without nuking the other.
        results = await asyncio.gather(
            run_deep_audit(business.website_uri),
            check_social_media(business.website_uri),
            return_exceptions=True,
        )
        audit_res, social_res = results
        if isinstance(audit_res, Exception):
            logger.warning(f"audit-place: deep audit failed for {business.website_uri}: {audit_res!r}")
        else:
            website_audit = audit_res
        if isinstance(social_res, Exception):
            logger.warning(f"audit-place: social check failed for {business.website_uri}: {social_res!r}")
        else:
            socials_found, socials = social_res

    metrics = compute_metrics(business)
    scorecard = compute_scorecard(business, metrics, website_audit)
    benchmark = compute_benchmark(business)
    derived_findings, recommendations = _maps_recommendations(
        business=business,
        website_audit=website_audit,
        metrics=metrics,
    )

    fetched_at_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    return MapsAuditResponse(
        place_id=place_id,
        fetched_at_iso=fetched_at_iso,
        business=business,
        website_audit=website_audit,
        socials_found=socials_found,
        socials=[ScanSocial(**s) for s in socials],
        derived_findings=derived_findings,
        recommendations=recommendations,
        metrics=metrics,
        scorecard=scorecard,
        benchmark=benchmark,
    )


@router.get(
    "/audit/access",
    summary="Whether the caller can run a Maps audit (Pro/Enterprise check)",
    tags=["audit"],
)
async def audit_access(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Lightweight feature-flag endpoint the SPA hits before showing the
    Maps audit input. Returns ``{ "allowed": bool, "plan": str, "reason": str }``.
    """
    allowed = _has_active_paid_plan(current_user)
    plan = (current_user.plan or "free")
    if allowed:
        reason = "ok"
    elif plan == "free":
        reason = "Upgrade to Pro or Enterprise to unlock the Google Maps audit."
    else:
        reason = "Your subscription is no longer active. Renew to keep using the Maps audit."
    return {"allowed": allowed, "plan": plan, "reason": reason}
