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

Note
----
The Google Maps place audit used to live here as ``/public/audit-place``
but has moved to the authenticated, plan-gated route
``/api/v1/audit/place`` (Pro/Enterprise only). See
``app/api/v1/audit.py``. The website audit ``/public/audit-website``
remains free and anonymous as the lead-magnet for the SPA.

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
from typing import Any, Optional

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
        socials_found, _socials = await check_social_media(audit.normalized_url)
    except Exception:
        socials_found = False

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
