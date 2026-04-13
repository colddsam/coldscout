"""
SEO Endpoints — Dynamic sitemap for public profiles.

Provides a machine-generated XML sitemap containing all public user profiles
so that search engines can discover and index them. This supplements the
static sitemap.xml that covers fixed pages (home, pricing, docs, etc.).

Public endpoints (no auth required):
  - GET /seo/sitemap-profiles.xml  — XML sitemap of all public profiles
"""

from datetime import datetime, timezone
from xml.sax.saxutils import escape as xml_escape
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.profile import UserProfile

router = APIRouter(prefix="/seo", tags=["seo"])

BASE_URL = "https://coldscout.colddsam.com"


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
