"""
Public, unauthenticated endpoints used by lead-magnet pages on the SPA.

These routes deliberately do **not** sit behind the ``X-API-Key`` guard
that the rest of the private API uses — they're invoked from anonymous
browser sessions on landing pages (``/scanner``) where there is no
session yet. To keep that exposure safe:

* every endpoint here is **read-only** — no rows are written to the
  primary database from public traffic. Captured emails (if any) flow
  through the existing signup path, not through these endpoints;
* every endpoint is **rate-limited** via slowapi, keyed on the caller's
  IP, so an abusive client can be cut off without affecting the
  pipeline or paying users;
* every endpoint **never proxies the request body verbatim** to any
  other service — we extract the URL we need, run our internal
  qualification helpers, and return a small JSON scorecard.

Adding new routes here
----------------------
Pick a tight rate limit (``@limiter.limit("10/minute")`` is a sensible
default for outbound-network-touching endpoints), and validate inputs
with Pydantic before reaching downstream HTTP work.

Note: we deliberately avoid ``from __future__ import annotations`` here.
slowapi's ``@limiter.limit`` decorator wraps the handler in a way that
forces FastAPI to re-resolve type hints for the request model, and
PEP 563 string-form annotations confuse Pydantic's forward-ref
resolution under that wrapping. Keeping annotations evaluated eagerly
sidesteps that without changing observable behaviour.
"""
import asyncio
import re
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from loguru import logger
from pydantic import BaseModel, Field

from app.core.rate_limit import limiter
from app.modules.qualification.social_checker import check_social_media
from app.modules.qualification.website_checker import (
    check_website,
    get_website_quality,
)
from app.modules.qualification.deep_audit import (
    DeepAudit,
    Finding,
    run_deep_audit,
)
from app.modules.qualification.maps_resolver import (
    BusinessProfile,
    fetch_business_profile,
    resolve_maps_url,
)


router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────


class ScanRequest(BaseModel):
    """Single-URL scan request body posted by the public scanner page."""

    url: str = Field(
        ...,
        min_length=4,
        max_length=2048,
        description=(
            "Website URL to audit. Scheme is optional — the server prepends "
            "``http://`` when missing, matching the behaviour of the existing "
            "qualification helpers used during the freelancer pipeline."
        ),
    )


class ScanFlaw(BaseModel):
    """One actionable issue surfaced on the public scorecard."""

    code: str
    title: str
    detail: str
    severity: str = Field(..., pattern=r"^(critical|warning|info)$")


class ScanSocial(BaseModel):
    platform: str
    url: str


class ScanResponse(BaseModel):
    """Result returned to the SPA's scanner page."""

    url: str
    normalized_url: str
    is_dns_valid: bool
    is_http_valid: bool
    has_ssl: bool
    is_mobile_friendly: bool
    is_free_builder: bool
    copyright_year: Optional[int]
    has_socials: bool
    socials: list[ScanSocial]
    flaws: list[ScanFlaw]
    score: int = Field(
        ...,
        ge=0,
        le=100,
        description=(
            "Digital-presence score (0-100). Higher = healthier digital "
            "footprint. NOT the same as the qualification score used in "
            "the private pipeline — that one is need-weighted and "
            "freelancer-facing."
        ),
    )


# ── Helpers ───────────────────────────────────────────────────────────


# Conservative URL shape filter. We accept domains with or without a
# scheme/path; we reject obvious junk so a single bad input can't even
# trigger the downstream HTTP work. The qualification helpers themselves
# perform their own validation, but failing fast here saves the upstream
# HTTP / DNS round trips on rate-limit-exhausted clients.
_URL_RE = re.compile(
    r"^(?:https?://)?"             # optional scheme
    r"(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+"  # subdomains
    r"[a-z]{2,63}"                 # TLD
    r"(?::\d{2,5})?"               # optional port
    r"(?:/[^\s]*)?$",              # optional path
    re.IGNORECASE,
)


def _normalize_url(raw: str) -> Optional[str]:
    """Trim, lower-host, and prepend a scheme if missing.

    Returns ``None`` if the input doesn't look like a URL at all so the
    caller can return a 422 without spending an outbound HTTP request.
    """
    candidate = raw.strip()
    if not candidate:
        return None
    if not _URL_RE.match(candidate):
        return None
    if not candidate.startswith(("http://", "https://")):
        candidate = "http://" + candidate
    return candidate


def _build_flaws(
    *,
    is_dns_valid: bool,
    is_http_valid: bool,
    quality: dict,
    has_socials: bool,
    copyright_year: Optional[int],
) -> tuple[list[ScanFlaw], int]:
    """Turn the raw qualification signals into a UI-ready flaw list and
    a 0-100 health score. Pure function — no I/O — so it stays cheap
    enough to run inside the rate-limited handler.
    """
    flaws: list[ScanFlaw] = []
    # Score starts at 100 and we deduct points per flaw. Weights match
    # the rough severity tiers used by the private scorer so a website
    # that the freelancer pipeline rejects also scores low here.
    score = 100

    if not is_dns_valid:
        flaws.append(
            ScanFlaw(
                code="dns_unreachable",
                severity="critical",
                title="Domain does not resolve",
                detail=(
                    "DNS could not find this domain. Either the website is "
                    "not registered, has expired, or you typed it wrong."
                ),
            )
        )
        score -= 60
        # Without DNS we can't say anything else — bail with a partial card.
        return flaws, max(score, 0)

    if not is_http_valid:
        flaws.append(
            ScanFlaw(
                code="http_unreachable",
                severity="critical",
                title="Website is not responding",
                detail=(
                    "The domain resolves but the website itself returned "
                    "an error or timed out. Visitors cannot load it right now."
                ),
            )
        )
        score -= 40

    if not quality.get("has_ssl", False):
        flaws.append(
            ScanFlaw(
                code="no_ssl",
                severity="critical",
                title="No SSL / HTTPS",
                detail=(
                    "Modern browsers warn visitors that your site is "
                    "“Not Secure”. Search engines also rank HTTP-only sites "
                    "lower than HTTPS sites."
                ),
            )
        )
        score -= 20

    if quality.get("is_free_builder", False):
        flaws.append(
            ScanFlaw(
                code="free_builder",
                severity="warning",
                title="Hosted on a free site builder",
                detail=(
                    "Free Wix / Weebly / WordPress.com pages signal "
                    "low-investment to potential customers and rank "
                    "poorly in search."
                ),
            )
        )
        score -= 10

    if not quality.get("is_mobile_friendly", False):
        flaws.append(
            ScanFlaw(
                code="not_mobile_friendly",
                severity="warning",
                title="Not mobile-friendly",
                detail=(
                    "We could not detect a viewport tag — most visitors "
                    "browse from a phone, and pages without a mobile layout "
                    "are nearly unusable on small screens."
                ),
            )
        )
        score -= 10

    if not has_socials:
        flaws.append(
            ScanFlaw(
                code="no_socials",
                severity="info",
                title="No social profiles linked",
                detail=(
                    "We couldn't find Facebook / Instagram / LinkedIn "
                    "links on this site. Social proof is a strong driver "
                    "of trust for first-time visitors."
                ),
            )
        )
        score -= 5

    if copyright_year:
        # Compare against the current year — anything 2+ years stale is a
        # public signal that the business has gone quiet.
        from datetime import date

        gap = date.today().year - copyright_year
        if gap >= 2:
            flaws.append(
                ScanFlaw(
                    code="stale_copyright",
                    severity="warning",
                    title=f"Copyright stuck on {copyright_year}",
                    detail=(
                        "The footer hasn't been updated in years. Visitors "
                        "(and Google) read that as “this business is no "
                        "longer active”."
                    ),
                )
            )
            score -= 5

    return flaws, max(score, 0)


# ── Routes ────────────────────────────────────────────────────────────


@router.post(
    "/public/scan-website",
    response_model=ScanResponse,
    summary="Lead-magnet scanner: audit a website's digital presence",
    tags=["public-scanner"],
)
@limiter.limit("10/minute")
async def scan_website(
    payload: ScanRequest,
    request: Request,
    response: Response,
) -> Any:
    """Run the qualification stack against a single URL and return a
    public-friendly scorecard.

    This endpoint is intentionally:

    * **Anonymous** — used by the ``/scanner`` page on the landing site
      before the visitor ever sees a login screen.
    * **Stateless** — no rows are inserted; nothing about the caller is
      retained beyond slowapi's in-process rate-limit counters.
    * **Best-effort** — every downstream check is wrapped so a single
      failure (e.g. social fetch returning a 403) returns a partial
      scorecard rather than a 5xx.

    The ``request`` parameter is used by slowapi to key the limiter on
    the caller's IP. The ``response`` parameter is required so slowapi
    can inject ``X-RateLimit-*`` headers into the outgoing response —
    omitting it crashes the limiter at runtime when ``headers_enabled``
    is on.
    """
    # ``response`` is intentionally unused inside the body — it's a
    # FastAPI-injected handle slowapi mutates on our behalf.
    _ = response
    normalized = _normalize_url(payload.url)
    if normalized is None:
        raise HTTPException(
            status_code=422,
            detail="That URL doesn't look right — try something like example.com",
        )

    # Stage 1: DNS + HTTP reachability. We need this before quality /
    # social checks so we can return early when the site is dead.
    try:
        is_dns_valid, is_http_valid, _ = await check_website(normalized)
    except Exception as e:
        # A bug in the helpers should not 500 the public endpoint —
        # return a partial result and log loudly.
        logger.exception(f"scan-website: check_website crashed for {normalized}: {e}")
        is_dns_valid, is_http_valid = False, False

    quality: dict
    socials: list[dict]
    if is_http_valid:
        # Stages 2 & 3 run concurrently — both make their own HTTP
        # request to the target site. ``return_exceptions=True`` keeps
        # one failing call from cancelling the other.
        results = await asyncio.gather(
            get_website_quality(normalized),
            check_social_media(normalized),
            return_exceptions=True,
        )
        quality_res, socials_res = results
        if isinstance(quality_res, Exception):
            logger.warning(f"scan-website: quality check failed for {normalized}: {quality_res!r}")
            quality = {}
        else:
            quality = quality_res or {}
        if isinstance(socials_res, Exception):
            logger.warning(f"scan-website: social check failed for {normalized}: {socials_res!r}")
            has_socials, socials = False, []
        else:
            has_socials, socials = socials_res
    else:
        quality = {}
        has_socials, socials = False, []

    # Override has_ssl using the actual normalized URL so an http://
    # site is correctly flagged even when the helpers couldn't fetch it.
    quality["has_ssl"] = normalized.lower().startswith("https://") and quality.get(
        "has_ssl", normalized.lower().startswith("https://")
    )
    copyright_year = quality.get("copyright_year")

    flaws, score = _build_flaws(
        is_dns_valid=is_dns_valid,
        is_http_valid=is_http_valid,
        quality=quality,
        has_socials=has_socials,
        copyright_year=copyright_year,
    )

    return ScanResponse(
        url=payload.url,
        normalized_url=normalized,
        is_dns_valid=is_dns_valid,
        is_http_valid=is_http_valid,
        has_ssl=bool(quality.get("has_ssl", False)),
        is_mobile_friendly=bool(quality.get("is_mobile_friendly", False)),
        is_free_builder=bool(quality.get("is_free_builder", False)),
        copyright_year=copyright_year,
        has_socials=has_socials,
        socials=[ScanSocial(**s) for s in socials],
        flaws=flaws,
        score=score,
    )


# ── Comprehensive audit endpoints ─────────────────────────────────────────


class AuditRequest(BaseModel):
    """Body for the deep-audit endpoint. Same surface as ScanRequest plus an
    explicit doc string — kept separate so the OpenAPI schema is unambiguous."""

    url: str = Field(
        ...,
        min_length=4,
        max_length=2048,
        description="Website URL to deep-audit. Scheme optional.",
    )


class MapsAuditRequest(BaseModel):
    """Body for the Maps-driven audit endpoint."""

    maps_url: str = Field(
        ...,
        min_length=10,
        max_length=2048,
        description=(
            "A Google Maps share URL, long URL, or raw Place ID. We resolve "
            "the place ID, fetch business intel, and (if a website is "
            "listed) run the same deep audit as /audit-website."
        ),
    )


class DerivedRecommendation(BaseModel):
    """Action item derived from Maps + website signals (Maps audit only)."""

    code: str
    title: str
    detail: str
    priority: str = Field(..., pattern=r"^(high|medium|low)$")


class MapsAuditResponse(BaseModel):
    place_id: str
    business: BusinessProfile
    website_audit: Optional[DeepAudit]
    socials_found: bool
    socials: list[ScanSocial]
    derived_findings: list[Finding]
    recommendations: list[DerivedRecommendation]


def _maps_recommendations(
    *,
    business: BusinessProfile,
    website_audit: Optional[DeepAudit],
) -> tuple[list[Finding], list[DerivedRecommendation]]:
    """Generate Maps-specific findings and high-level marketing advice.

    Pure analysis over the BusinessProfile. The website findings are already
    inside ``website_audit.findings``; this function only adds the
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

    if business.rating is not None and business.rating < 4.0 and (business.user_rating_count or 0) >= 10:
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

    if not business.editorial_summary and business.user_rating_count and business.user_rating_count > 50:
        findings.append(
            Finding(
                category="aeo",
                code="maps_no_editorial",
                title="No editorial description on Google",
                detail=(
                    "Established businesses sometimes get a Google-curated summary. "
                    "Earning one boosts answer-engine citations."
                ),
                suggestion="Maintain a complete profile (description, services, posts) so Google's editorial team has signal to work with.",
                severity="info",
                impact="low",
            )
        )

    # Website-derived recommendations (delivered as DerivedRecommendation
    # entries so the SPA can show a tidy "next steps" panel separate from
    # the audit findings list).
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

        if not any(f.category == "schema" and "incomplete" not in f.code for f in website_audit.findings):
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


@router.post(
    "/public/audit-website",
    response_model=DeepAudit,
    summary="Comprehensive SEO/AEO/trust/performance audit for a website",
    tags=["public-scanner"],
)
@limiter.limit("5/minute")
async def audit_website(
    payload: AuditRequest,
    request: Request,
    response: Response,
) -> Any:
    """Public, anonymous deep-audit endpoint.

    Single outbound HTTP fetch + a few HEAD probes for robots/sitemap/llms.
    Returns a categorized scorecard with actionable suggestions per finding.

    Conservative rate limit (5/min/IP) reflects the higher upstream cost
    relative to the basic ``scan-website`` endpoint.
    """
    _ = response  # injected for slowapi headers

    # We do social discovery in parallel with the deep audit so we can pass
    # ``socials_found`` into the Trust category. The two requests are
    # independent — one is the homepage GET, the other parses links from
    # the same homepage. To avoid double-fetching, we run audit first.
    audit = await run_deep_audit(payload.url)
    if audit is None:
        raise HTTPException(
            status_code=422,
            detail="That URL doesn't look right — try something like example.com",
        )

    # Best-effort social check (re-uses an additional homepage GET, but on
    # a 5/min limit the cost is acceptable).
    try:
        socials_found, socials = await check_social_media(audit.normalized_url)
    except Exception:
        socials_found, socials = False, []

    if not socials_found:
        # Re-attach the trust finding now that we know — re-running run_deep_audit
        # would double the latency budget, so we patch in place.
        already = any(f.code == "no_socials" for f in audit.findings)
        if not already:
            audit.findings.append(
                Finding(
                    category="trust",
                    code="no_socials",
                    title="No social profile links found",
                    detail="Social proof is one of the strongest trust signals for first-time visitors.",
                    suggestion="Add LinkedIn (B2B), Instagram (consumer), or Facebook (local) icons in the footer.",
                    severity="info",
                    impact="low",
                )
            )

    return audit


@router.post(
    "/public/audit-place",
    response_model=MapsAuditResponse,
    summary="Resolve a Google Maps URL → business intel + website audit",
    tags=["public-scanner"],
)
@limiter.limit("5/minute")
async def audit_place(
    payload: MapsAuditRequest,
    request: Request,
    response: Response,
) -> Any:
    """Take any Google Maps share URL or place_id and return a complete
    audit: the business profile pulled from the Places API, plus (if the
    listing has a website) the same deep audit as ``/audit-website`` over
    that website. Adds Maps-specific findings (rating, reviews, photos,
    hours) and a 'recommendations' list of high-level marketing actions.

    Cost notes:
      - One Places Details call (paid, ~$0.005 / request).
      - Up to one HEAD on a shortlink unfurl.
      - The website audit cost only fires if the listing has a website.
    """
    _ = response

    place_id = await resolve_maps_url(payload.maps_url)
    if not place_id:
        raise HTTPException(
            status_code=422,
            detail=(
                "Couldn't extract a Place ID from that URL. Open the place in "
                "Google Maps, click Share → Copy link, and paste the long URL."
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
        try:
            website_audit = await run_deep_audit(business.website_uri)
        except Exception as e:
            logger.exception(f"audit-place: deep audit failed for {business.website_uri}: {e}")
        try:
            socials_found, socials = await check_social_media(business.website_uri)
        except Exception:
            socials_found, socials = False, []

    derived_findings, recommendations = _maps_recommendations(
        business=business,
        website_audit=website_audit,
    )

    return MapsAuditResponse(
        place_id=place_id,
        business=business,
        website_audit=website_audit,
        socials_found=socials_found,
        socials=[ScanSocial(**s) for s in socials],
        derived_findings=derived_findings,
        recommendations=recommendations,
    )
