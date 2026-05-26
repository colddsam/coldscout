"""
SEO Endpoints — Dynamic sitemap + bot prerender mirror.

Provides:
  - GET /seo/sitemap-profiles.xml  — XML sitemap of all public profiles
  - GET /seo/prerender             — Bot prerender (self-host mirror of the
                                     Vercel Edge prerender at /api/prerender).
                                     Self-hosted nginx forwards bot UAs here.

The prerender endpoint exists so an OSS user running Cold Scout behind their
own nginx (per the bundled nginx.conf) gets the same per-route meta + JSON-LD
injection that Vercel users get out of the box. The two implementations are
intentionally kept in lockstep — same query contract, same injection rules.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from xml.sax.saxutils import escape as xml_escape
import html as _html
import re

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.profile import UserProfile
from app.models.lead import Lead

router = APIRouter(prefix="/seo", tags=["seo"])

BASE_URL = "https://coldscout.colddsam.com"
API_BASE_URL = "https://api.coldscout.colddsam.com"


@router.get("/sitemap-profiles.xml", response_class=Response)
async def sitemap_profiles(db: AsyncSession = Depends(get_db)) -> Response:
    """
    Generate an XML sitemap listing all public user profiles.

    Only profiles with ``is_public=True`` are included. Each entry uses
    the profile's ``updated_at`` timestamp as ``<lastmod>`` so search
    engines can prioritize recently-updated profiles.

    The response is cached at the CDN layer via Cache-Control headers
    (1 hour) to avoid hitting the database on every crawl request.
    """
    result = await db.execute(
        select(UserProfile.username, UserProfile.updated_at)
        .where(UserProfile.is_public == True)  # noqa: E712
        .order_by(UserProfile.updated_at.desc())
    )
    profiles = result.all()

    # Build XML
    urls: list[str] = []
    for username, updated_at in profiles:
        if not username:
            continue
        # XML-escape the username to prevent XML injection via special characters
        safe_username = xml_escape(str(username))
        lastmod = updated_at.strftime("%Y-%m-%d") if updated_at else datetime.now(timezone.utc).strftime("%Y-%m-%d")
        urls.append(
            f"  <url>\n"
            f"    <loc>{BASE_URL}/u/{safe_username}</loc>\n"
            f"    <lastmod>{lastmod}</lastmod>\n"
            f"    <changefreq>weekly</changefreq>\n"
            f"    <priority>0.7</priority>\n"
            f"  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls) + "\n"
        '</urlset>\n'
    )

    return Response(
        content=xml,
        media_type="application/xml; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Robots-Tag": "noindex",
        },
    )


@router.get("/sitemap-directory.xml", response_class=Response)
async def sitemap_directory(db: AsyncSession = Depends(get_db)) -> Response:
    """
    XML sitemap for the public business directory.

    Two surfaces are listed:
      1. ``/directory/lead/{slug}`` — every individually-public lead.
      2. ``/directory/{industry}/{city}`` — every (industry, city) pair
         that has at least one public lead, so search engines crawl the
         long-tail city+category pages.

    Lead-level visibility is currently driven by ``is_public_override``
    (when set) falling back to a public-by-default rule. The exact column
    name varies by deploy; we look it up dynamically below.
    """
    # A lead is publicly indexable when ``is_public`` is True AND the
    # operator hasn't flipped the per-lead privacy override.
    base_filters = [
        Lead.is_public.is_(True),
        Lead.is_private_override.is_(False),
    ]

    # Lead-level URLs (capped to avoid sitemap blowing past Google's 50k limit).
    lead_q = (
        select(Lead.slug, Lead.updated_at)
        .where(*base_filters, Lead.slug.is_not(None))
        .order_by(Lead.updated_at.desc().nulls_last())
        .limit(45000)
    )
    lead_rows = (await db.execute(lead_q)).all()

    # (industry, city) pairs that have at least one public lead.
    pair_q = (
        select(Lead.category, Lead.city)
        .where(*base_filters, Lead.category.is_not(None), Lead.city.is_not(None))
        .group_by(Lead.category, Lead.city)
        .limit(5000)
    )
    pair_rows = (await db.execute(pair_q)).all()

    def _slugify(value: str) -> str:
        """Lowercase, replace whitespace+special chars with hyphens — matches
        the frontend's slug rules so URLs stay canonical."""
        v = (value or "").strip().lower()
        v = re.sub(r"[^a-z0-9]+", "-", v).strip("-")
        return v

    urls: list[str] = []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for slug, updated_at in lead_rows:
        if not slug:
            continue
        lastmod = updated_at.strftime("%Y-%m-%d") if updated_at else today
        urls.append(
            f"  <url>\n"
            f"    <loc>{BASE_URL}/directory/lead/{xml_escape(str(slug))}</loc>\n"
            f"    <lastmod>{lastmod}</lastmod>\n"
            f"    <changefreq>weekly</changefreq>\n"
            f"    <priority>0.6</priority>\n"
            f"  </url>"
        )
    for category, city in pair_rows:
        ind = _slugify(category)
        cty = _slugify(city)
        if not ind or not cty:
            continue
        urls.append(
            f"  <url>\n"
            f"    <loc>{BASE_URL}/directory/{xml_escape(ind)}/{xml_escape(cty)}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>daily</changefreq>\n"
            f"    <priority>0.7</priority>\n"
            f"  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls) + "\n"
        '</urlset>\n'
    )
    return Response(
        content=xml,
        media_type="application/xml; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=1800, s-maxage=3600",
            "X-Robots-Tag": "noindex",
        },
    )


# ─── Bot prerender ────────────────────────────────────────────────────────────

# Static route → meta map. Mirrors frontend/api/prerender.ts so the two
# implementations stay in sync. Edit both when adding a new public route.
STATIC_ROUTE_META: dict[str, dict[str, str]] = {
    "/": {
        "title": "Cold Scout — AI Lead Generation Platform | Automate B2B Outreach",
        "description": "Cold Scout uses AI to discover, enrich, and engage local business leads — automating your entire outreach pipeline from search to inbox.",
    },
    "/pricing": {
        "title": "Pricing — Cold Scout AI Lead Generation",
        "description": "Simple, transparent pricing. Free open-source self-hosting, Pro managed API at ₹100/month, Enterprise at ₹2,000/month.",
    },
    "/docs": {
        "title": "Documentation — Cold Scout AI Lead Generation Setup & API Guide",
        "description": "Complete setup guide for Cold Scout: architecture, Google Maps API, Groq AI, Supabase, environment variables, Docker deployment.",
        "ogType": "article",
    },
    "/faq": {
        "title": "FAQ — Cold Scout AI Lead Generation Platform",
        "description": "Frequently asked questions — product capabilities, pricing tiers, integrations, MCP server, AI models, GDPR compliance.",
    },
    "/compare": {
        "title": "Cold Scout vs Apollo vs Outreach vs Instantly — Comparison",
        "description": "Honest side-by-side comparison of Cold Scout against Apollo, Outreach, and Instantly.",
    },
    "/use-cases": {
        "title": "Use Cases — Cold Scout for Freelancers, Agencies, SaaS, AI Agents",
        "description": "How freelancers, marketing agencies, SaaS go-to-market teams, and AI agent builders use Cold Scout in production.",
    },
    "/integrations": {
        "title": "Integrations — Cold Scout AI Lead Generation Platform",
        "description": "Cold Scout integrates with Google Places, Groq, Brevo, Supabase, Razorpay, Meta Threads, and the Model Context Protocol.",
    },
    "/changelog": {
        "title": "Changelog — Cold Scout AI Lead Generation Platform",
        "description": "Release notes and product updates for Cold Scout — what shipped, when, and what is in flight.",
    },
    "/blog": {
        "title": "Blog — Cold Scout: AI Lead Generation, Outreach, Sales Engineering",
        "description": "Articles, comparisons, and how-tos on AI lead generation, B2B outreach automation, and modern sales pipelines.",
    },
    "/guides": {
        "title": "Guides — Cold Scout: Self-host, Setup, MCP Server, Deliverability",
        "description": "Technical guides for the Cold Scout open-source AI lead generation platform.",
    },
    "/support": {
        "title": "Customer Support — Cold Scout",
        "description": "Customer support — email response within 48 hours on Pro, 4 hours on Enterprise.",
    },
    "/privacy": {
        "title": "Privacy Policy — Cold Scout",
        "description": "Privacy policy for Cold Scout — data handling, GDPR/CCPA rights, third-party services, retention.",
    },
    "/terms": {
        "title": "Terms of Service — Cold Scout",
        "description": "Terms of service for the Cold Scout AI lead generation platform.",
    },
    "/refund-policy": {
        "title": "Refund Policy — Cold Scout",
        "description": "Refund and cancellation policy for Cold Scout subscriptions.",
    },
    "/delete-data": {
        "title": "Data Deletion Request — Cold Scout",
        "description": "Submit a GDPR/CCPA data deletion request for your Cold Scout account.",
    },
    "/scanner": {
        "title": "Free Lead Scanner — Audit Any Business in 30 Seconds | Cold Scout",
        "description": "Free public scanner that audits a local business in 30 seconds. Score a Google Maps listing on website quality, reviews, social signal, and digital presence — no signup, no card.",
    },
    "/download": {
        "title": "Download App — Cold Scout",
        "description": "Download the Cold Scout mobile companion app or grab the open-source self-host package from GitHub.",
    },
    "/directory": {
        "title": "Business Lead Directory — Find Local Service Leads | Cold Scout",
        "description": "Browse thousands of local business leads by city and industry. Find plumbers, roofers, contractors, and other businesses that need digital services.",
    },
}


def _esc(s: str) -> str:
    """HTML-escape for attribute and text content."""
    return _html.escape(s, quote=True)


def _replace_meta(html_doc: str, attr: str, key: str, value: str) -> str:
    """Replace a <meta> tag by attribute key, or append before </head> if absent."""
    pattern = re.compile(
        rf'<meta\s+{attr}=["\']{re.escape(key)}["\'][^>]*>',
        re.IGNORECASE,
    )
    tag = f'<meta {attr}="{key}" content="{value}" />'
    if pattern.search(html_doc):
        return pattern.sub(tag, html_doc)
    return html_doc.replace("</head>", f"  {tag}\n  </head>")


def _inject_meta(html_doc: str, meta: dict[str, str], canonical: str) -> str:
    """Mutate the SPA shell with route-specific meta + canonical."""
    title = _esc(meta["title"])
    description = _esc(meta["description"])
    canonical_esc = _esc(canonical)
    og_type = _esc(meta.get("ogType", "website"))
    og_image = _esc(meta.get("ogImage", f"{BASE_URL}/banner.png"))
    indexed = meta.get("index", True)
    robots = (
        "noindex, follow"
        if indexed is False
        else "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
    )

    out = re.sub(
        r"<title>[\s\S]*?</title>", f"<title>{title}</title>", html_doc, count=1, flags=re.IGNORECASE
    )
    out = _replace_meta(out, "name", "description", description)
    out = _replace_meta(out, "name", "robots", robots)
    out = _replace_meta(out, "property", "og:title", title)
    out = _replace_meta(out, "property", "og:description", description)
    out = _replace_meta(out, "property", "og:url", canonical_esc)
    out = _replace_meta(out, "property", "og:image", og_image)
    out = _replace_meta(out, "property", "og:type", og_type)
    out = _replace_meta(out, "name", "twitter:title", title)
    out = _replace_meta(out, "name", "twitter:description", description)
    out = _replace_meta(out, "name", "twitter:image", og_image)

    # Canonical link
    canonical_pattern = re.compile(
        r'<link\s+rel=["\']canonical["\'][^>]*>', re.IGNORECASE
    )
    canonical_tag = f'<link rel="canonical" href="{canonical_esc}" />'
    if canonical_pattern.search(out):
        out = canonical_pattern.sub(canonical_tag, out)
    else:
        out = out.replace("</head>", f"  {canonical_tag}\n  </head>")

    return out


def _load_shell() -> Optional[str]:
    """Locate and read the SPA shell. Returns None if not found.

    Expected layout:
      backend/app/api/v1/seo.py  → ../../../../frontend/dist/index.html
      For OSS / docker, FRONTEND_DIST_PATH env var can override.
    """
    import os

    override = os.environ.get("FRONTEND_DIST_PATH")
    candidates = []
    if override:
        candidates.append(Path(override) / "index.html")

    here = Path(__file__).resolve()
    candidates.extend(
        [
            here.parents[3] / "frontend" / "dist" / "index.html",
            here.parents[4] / "frontend" / "dist" / "index.html",
            here.parents[3] / "frontend" / "index.html",  # dev fallback
        ]
    )

    for c in candidates:
        if c.exists():
            try:
                return c.read_text(encoding="utf-8")
            except OSError:
                continue
    return None


async def _resolve_profile(username: str, db: AsyncSession) -> Optional[dict[str, str]]:
    """Pull a public profile and shape it as prerender meta."""
    result = await db.execute(
        select(UserProfile).where(
            UserProfile.username == username,
            UserProfile.is_public == True,  # noqa: E712
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        return None

    name = profile.full_name or username
    title = f"{name} | Cold Scout"
    return {
        "title": title,
        "description": f"View {name}'s public profile on Cold Scout — AI-powered lead generation platform.",
        "ogType": "profile",
        "ogImage": getattr(profile, "profile_photo_url", None)
        or getattr(profile, "avatar_url", None)
        or f"{BASE_URL}/banner.png",
        "index": True,
    }


@router.get("/prerender", response_class=Response)
async def prerender(
    path: str = Query(default="/", description="Original request path to prerender"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Serve the SPA shell with route-specific meta tags injected.

    This endpoint is invoked by self-host nginx configurations that detect
    bot UAs and forward those requests here (see frontend/nginx.conf for
    the recommended snippet). The Vercel Edge equivalent lives in
    frontend/api/prerender.ts. Both implementations honor the same path
    contract so a single ROUTE_META map drives both deployments.
    """
    shell = _load_shell()
    if shell is None:
        # Best effort — return a tiny fallback so crawlers still see meta.
        return Response(
            content=(
                "<!doctype html><html lang=\"en\"><head>"
                "<meta charset=\"utf-8\">"
                "<title>Cold Scout — AI Lead Generation Platform</title>"
                "<meta name=\"description\" content=\"AI lead generation platform.\">"
                "</head><body></body></html>"
            ),
            media_type="text/html; charset=utf-8",
        )

    normalized = "/" if path in ("", "/") else path.rstrip("/")
    canonical = f"{BASE_URL}{normalized if normalized else '/'}"
    meta: Optional[dict[str, str]] = STATIC_ROUTE_META.get(normalized)

    if meta is None and normalized.startswith("/u/"):
        username = normalized.removeprefix("/u/").split("/")[0]
        if username:
            meta = await _resolve_profile(username, db)

    if meta is None and normalized.startswith("/demo/"):
        meta = {
            "title": "Your Website Demo | Cold Scout",
            "description": "A custom website demo built for your business by Cold Scout.",
            "index": False,
        }

    if meta is None and normalized.startswith("/shared/audit/"):
        # Shared audit reports are private snapshots — never expose any
        # detail to a crawler, and noindex the canonical so a leaked
        # token can't be scooped up by search engines.
        meta = {
            "title": "Shared audit report — Cold Scout",
            "description": "A Cold Scout audit report shared privately with you. Sign in to view.",
            "index": False,
        }

    if meta is None:
        meta = STATIC_ROUTE_META["/"]

    html_doc = _inject_meta(shell, meta, canonical)

    return Response(
        content=html_doc,
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
            "X-Cold-Scout-Prerender": "1",
        },
    )
