"""
Deep website audit — SEO, AEO, performance, trust, accessibility.

Used by the public ``/api/v1/public/audit-website`` endpoint to produce a
multi-category scorecard suitable for a lead-magnet "free audit" page.

Design constraints
------------------
* **Single fetch**: The endpoint is rate-limited and called from anonymous
  visitors; we do at most one outbound HTTP request to the audited site,
  plus one optional ``robots.txt`` and one optional ``sitemap.xml`` HEAD.
  Anything else inflates p95 latency past the 10-second budget Vercel/Render
  give us before they kill the connection.
* **Pure analysis, partial results**: Every check tolerates missing inputs.
  If the homepage 404s we still return the categories that don't depend on
  body HTML (DNS, HTTPS, etc.) so the caller can render a useful page.
* **No paid APIs**: No Lighthouse, no PageSpeed Insights — those need quota.
  We approximate Core Web Vitals with HTML-level signals (preload, viewport,
  inline-style/script weight). Rough but honest.
* **AEO-aware**: Modern answer engines (Perplexity, ChatGPT, Claude) lean
  heavily on structured data, llms.txt, and clear answer blocks. We surface
  those as their own category instead of folding them into generic SEO.

The data shape is stable — see ``DeepAudit`` below. Adding a new check
involves writing a function that returns ``Finding`` objects and appending
its result list inside ``run_deep_audit``.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from pydantic import BaseModel, Field


# ── Data shapes ────────────────────────────────────────────────────────────


class Finding(BaseModel):
    """One actionable item reported to the visitor."""

    category: str = Field(
        ...,
        description=(
            "Top-level audit category. One of: indexability, meta, headings, "
            "content, schema, performance, mobile, accessibility, trust, aeo."
        ),
    )
    code: str = Field(..., description="Stable identifier so the UI can dedupe.")
    title: str
    detail: str
    severity: str = Field(..., pattern=r"^(critical|warning|info|good)$")
    suggestion: str = Field(
        ...,
        description="One-line, imperative recommendation the business should action.",
    )
    impact: str = Field(
        default="medium",
        pattern=r"^(high|medium|low)$",
        description="Rough business impact estimate. Drives UI sort order.",
    )


class CategoryScore(BaseModel):
    """Per-category score 0-100 with a one-line headline."""

    category: str
    score: int = Field(..., ge=0, le=100)
    headline: str
    findings_count: int


class DeepAudit(BaseModel):
    """Top-level response shape consumed by the SPA."""

    url: str
    normalized_url: str
    final_url: str
    fetched_at_iso: str
    is_dns_valid: bool
    is_http_valid: bool
    http_status: Optional[int]
    final_redirect_chain: list[str]
    page_title: Optional[str]
    meta_description: Optional[str]
    canonical: Optional[str]
    has_ssl: bool
    overall_score: int = Field(..., ge=0, le=100)
    grade: str = Field(..., pattern=r"^(A\+|A|B|C|D|F)$")
    summary: str
    category_scores: list[CategoryScore]
    findings: list[Finding]
    detected_schemas: list[str]
    open_graph: dict[str, str]
    twitter: dict[str, str]
    word_count: int
    image_count: int
    image_without_alt_count: int
    internal_link_count: int
    external_link_count: int
    has_robots_txt: bool
    has_sitemap_referenced: bool
    has_llms_txt: bool


# ── Helpers ────────────────────────────────────────────────────────────────


_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36 ColdScoutAudit/1.0"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.7",
}


def _normalize_url(raw: str) -> Optional[str]:
    """Trim, validate roughly, prepend http if scheme missing."""
    raw = (raw or "").strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        raw = "http://" + raw
    parsed = urlparse(raw)
    # Basic sanity — must have a netloc with a dot.
    if not parsed.netloc or "." not in parsed.netloc:
        return None
    return raw


async def _fetch(
    client: httpx.AsyncClient,
    url: str,
    timeout: float = 8.0,
) -> tuple[Optional[httpx.Response], list[str]]:
    """GET ``url``, return the response and its redirect chain. None on fail."""
    chain: list[str] = []
    try:
        resp = await client.get(url, timeout=timeout, follow_redirects=True)
        # Build chain (httpx's history is a list of pre-redirect responses).
        for r in resp.history:
            chain.append(str(r.url))
        chain.append(str(resp.url))
        return resp, chain
    except Exception as e:
        logger.debug(f"_fetch: {url} failed — {e!r}")
        return None, chain


async def _head_ok(client: httpx.AsyncClient, url: str) -> bool:
    """Return True if a HEAD/GET to url returns < 400 in <4s."""
    try:
        resp = await client.head(url, timeout=4.0, follow_redirects=True)
        if resp.status_code < 400:
            return True
        # Some hosts disallow HEAD — fall back to a tiny GET.
        if resp.status_code in (403, 405, 501):
            resp = await client.get(url, timeout=4.0, follow_redirects=True)
            return resp.status_code < 400
        return False
    except Exception:
        return False


# ── Per-category checks ────────────────────────────────────────────────────


def _check_indexability(
    *,
    final_url: str,
    soup: Optional[BeautifulSoup],
    has_robots_txt: bool,
    has_sitemap_referenced: bool,
    is_https: bool,
) -> tuple[list[Finding], int]:
    """Crawler / indexability signals."""
    findings: list[Finding] = []
    score = 100

    if not is_https:
        findings.append(
            Finding(
                category="indexability",
                code="no_https",
                title="Site does not enforce HTTPS",
                detail=(
                    "Search engines flag HTTP-only sites as 'Not Secure' and rank "
                    "them lower than HTTPS-equivalents."
                ),
                suggestion=(
                    "Install a free Let's Encrypt certificate or enable HTTPS in "
                    "your hosting provider, then 301-redirect HTTP → HTTPS."
                ),
                severity="critical",
                impact="high",
            )
        )
        score -= 25

    if not has_robots_txt:
        findings.append(
            Finding(
                category="indexability",
                code="no_robots_txt",
                title="No robots.txt found",
                detail=(
                    "Without a robots.txt, search engines fall back to default "
                    "crawl rules and you have no way to block scrapers or "
                    "duplicate paths."
                ),
                suggestion=(
                    "Add /robots.txt with at minimum 'User-agent: *' and a "
                    "'Sitemap:' line pointing at your sitemap.xml."
                ),
                severity="warning",
                impact="medium",
            )
        )
        score -= 10

    if not has_sitemap_referenced:
        findings.append(
            Finding(
                category="indexability",
                code="no_sitemap",
                title="No sitemap reference detected",
                detail=(
                    "We could not find a sitemap.xml at the standard location or "
                    "referenced from robots.txt. Sitemaps speed up indexing of "
                    "new pages by hours-to-days."
                ),
                suggestion=(
                    "Generate a sitemap.xml (most CMSes do this automatically) "
                    "and add 'Sitemap: https://yourdomain.com/sitemap.xml' to robots.txt."
                ),
                severity="warning",
                impact="medium",
            )
        )
        score -= 10

    if soup is not None:
        meta_robots = soup.find("meta", attrs={"name": re.compile(r"^robots$", re.I)})
        if meta_robots and "noindex" in (meta_robots.get("content") or "").lower():
            findings.append(
                Finding(
                    category="indexability",
                    code="meta_noindex",
                    title="<meta robots> contains 'noindex'",
                    detail=(
                        "This page is explicitly telling Google not to index it. "
                        "If unintentional, no organic traffic will reach it."
                    ),
                    suggestion=(
                        "Remove 'noindex' from <meta name=\"robots\">, or change to "
                        "'index, follow' if you want this page in search results."
                    ),
                    severity="critical",
                    impact="high",
                )
            )
            score -= 30

        canonical_tag = soup.find("link", rel="canonical")
        if not canonical_tag or not canonical_tag.get("href"):
            findings.append(
                Finding(
                    category="indexability",
                    code="no_canonical",
                    title="Missing canonical URL",
                    detail=(
                        "Without <link rel='canonical'> Google may treat similar "
                        "URLs (with trailing slash, query params, etc.) as duplicates."
                    ),
                    suggestion=(
                        "Add <link rel=\"canonical\" href=\"<the preferred URL>\" /> "
                        "to <head> on every page."
                    ),
                    severity="warning",
                    impact="medium",
                )
            )
            score -= 10
        else:
            href = (canonical_tag.get("href") or "").strip()
            if href and not href.startswith(("http://", "https://")):
                # Relative canonicals are spec-allowed but Google recommends absolute.
                findings.append(
                    Finding(
                        category="indexability",
                        code="relative_canonical",
                        title="Canonical URL is relative",
                        detail=(
                            "Relative canonicals are valid but ambiguous when crawlers "
                            "encounter pages from different paths. Absolute is safer."
                        ),
                        suggestion=(
                            "Change canonical to a fully-qualified URL "
                            "starting with https://."
                        ),
                        severity="info",
                        impact="low",
                    )
                )
                score -= 3

    return findings, max(score, 0)


def _check_meta(*, soup: Optional[BeautifulSoup]) -> tuple[list[Finding], int]:
    """Title, description, OG, Twitter."""
    findings: list[Finding] = []
    score = 100

    if soup is None:
        return [], 0

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""
    if not title:
        findings.append(
            Finding(
                category="meta",
                code="missing_title",
                title="<title> is missing or empty",
                detail="The browser tab text and the search-result blue link both come from <title>.",
                suggestion=(
                    "Add a 30–65 character <title> that includes your primary keyword "
                    "and brand name."
                ),
                severity="critical",
                impact="high",
            )
        )
        score -= 30
    else:
        if len(title) < 25:
            findings.append(
                Finding(
                    category="meta",
                    code="short_title",
                    title=f"<title> is short ({len(title)} chars)",
                    detail="Short titles waste available SERP real estate and rarely include keywords.",
                    suggestion="Expand to 30–65 characters and include your primary keyword.",
                    severity="warning",
                    impact="medium",
                )
            )
            score -= 8
        elif len(title) > 70:
            findings.append(
                Finding(
                    category="meta",
                    code="long_title",
                    title=f"<title> is long ({len(title)} chars)",
                    detail="Google truncates titles past ~70 chars in search results.",
                    suggestion="Trim to under 65 characters; put the most important words first.",
                    severity="info",
                    impact="low",
                )
            )
            score -= 4

    desc_tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    desc = (desc_tag.get("content") if desc_tag else "") or ""
    desc = desc.strip()
    if not desc:
        findings.append(
            Finding(
                category="meta",
                code="missing_description",
                title="No <meta name='description'>",
                detail="Without a description, Google generates its own from page content — quality varies.",
                suggestion="Add a 120–160 char description that summarizes the page and includes a CTA word.",
                severity="warning",
                impact="medium",
            )
        )
        score -= 12
    elif len(desc) < 80:
        findings.append(
            Finding(
                category="meta",
                code="short_description",
                title=f"Meta description is short ({len(desc)} chars)",
                detail="Under-90-character descriptions get rewritten by Google more than 60% of the time.",
                suggestion="Aim for 120–160 chars with a clear value proposition + CTA.",
                severity="info",
                impact="low",
            )
        )
        score -= 4
    elif len(desc) > 180:
        findings.append(
            Finding(
                category="meta",
                code="long_description",
                title=f"Meta description is long ({len(desc)} chars)",
                detail="Past 160 characters, Google truncates with an ellipsis.",
                suggestion="Trim to ≤160 characters; your CTA should land before the cut-off.",
                severity="info",
                impact="low",
            )
        )
        score -= 3

    og_tags = {
        (m.get("property") or "").lower().removeprefix("og:"): (m.get("content") or "")
        for m in soup.find_all("meta", attrs={"property": re.compile(r"^og:", re.I)})
    }
    if "title" not in og_tags or "description" not in og_tags or "image" not in og_tags:
        missing = [
            k for k in ("title", "description", "image") if k not in og_tags or not og_tags[k]
        ]
        findings.append(
            Finding(
                category="meta",
                code="incomplete_og",
                title=f"Open Graph missing: {', '.join(missing)}",
                detail=(
                    "OG tags drive how your link previews render on LinkedIn, Slack, "
                    "Twitter/X, Facebook, WhatsApp. Missing tags = ugly preview cards."
                ),
                suggestion="Add og:title, og:description, og:image (1200x630) to <head>.",
                severity="warning",
                impact="medium",
            )
        )
        score -= 10

    twitter_tags = {
        (m.get("name") or "").lower().removeprefix("twitter:"): (m.get("content") or "")
        for m in soup.find_all("meta", attrs={"name": re.compile(r"^twitter:", re.I)})
    }
    if "card" not in twitter_tags:
        findings.append(
            Finding(
                category="meta",
                code="no_twitter_card",
                title="No Twitter Card markup",
                detail="Twitter / X falls back to a tiny preview without twitter:card meta.",
                suggestion="Add <meta name='twitter:card' content='summary_large_image' /> and the related title/description/image tags.",
                severity="info",
                impact="low",
            )
        )
        score -= 4

    return findings, max(score, 0)


def _check_headings(*, soup: Optional[BeautifulSoup]) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    score = 100

    if soup is None:
        return [], 0

    h1s = soup.find_all("h1")
    if len(h1s) == 0:
        findings.append(
            Finding(
                category="headings",
                code="no_h1",
                title="No <h1> on the page",
                detail="The H1 is your strongest on-page signal of what the page is about.",
                suggestion="Add a single descriptive <h1> at the top of the page that mentions your primary keyword.",
                severity="critical",
                impact="high",
            )
        )
        score -= 25
    elif len(h1s) > 1:
        findings.append(
            Finding(
                category="headings",
                code="multiple_h1",
                title=f"Multiple H1 tags found ({len(h1s)})",
                detail="Modern HTML5 allows multiple H1s but most CMS templates do this by accident.",
                suggestion="Demote secondary H1s to H2/H3 so the page hierarchy is unambiguous.",
                severity="warning",
                impact="medium",
            )
        )
        score -= 10
    else:
        h1_text = h1s[0].get_text(strip=True)
        if not h1_text:
            findings.append(
                Finding(
                    category="headings",
                    code="empty_h1",
                    title="<h1> tag is empty",
                    detail="Empty H1 (often used for image-only headings) provides no SEO value.",
                    suggestion="Replace with a text H1, or add aria-label / alt-text on the image inside.",
                    severity="warning",
                    impact="medium",
                )
            )
            score -= 12
        elif len(h1_text) < 10:
            findings.append(
                Finding(
                    category="headings",
                    code="short_h1",
                    title=f"<h1> is very short ('{h1_text}')",
                    detail="Short H1s rarely contain enough keyword context to rank.",
                    suggestion="Expand to a full descriptive sentence including your primary keyword.",
                    severity="info",
                    impact="low",
                )
            )
            score -= 4

    h2s = soup.find_all("h2")
    if len(h2s) == 0:
        findings.append(
            Finding(
                category="headings",
                code="no_h2",
                title="No H2 subheadings",
                detail=(
                    "Pages without H2/H3 structure are harder to skim and often miss "
                    "long-tail ranking opportunities."
                ),
                suggestion="Break content into 3+ logical sections; use H2 for each section title.",
                severity="info",
                impact="low",
            )
        )
        score -= 6

    return findings, max(score, 0)


def _check_content(
    *,
    soup: Optional[BeautifulSoup],
) -> tuple[list[Finding], int, int, int, int, int]:
    """Word count, image alts, internal/external link counts.

    Returns ``(findings, score, word_count, image_count, image_without_alt, internal_links, external_links)``.
    """
    findings: list[Finding] = []
    score = 100
    word_count = 0
    image_count = 0
    image_without_alt_count = 0
    internal_link_count = 0
    external_link_count = 0

    if soup is None:
        return [], 0, 0, 0, 0, 0, 0

    body = soup.find("body")
    if body:
        # Strip script/style/nav/footer text from word count to avoid noise.
        for tag in body(["script", "style", "noscript"]):
            tag.decompose()
        text = body.get_text(separator=" ", strip=True)
        words = re.findall(r"[A-Za-zऀ-ॿ]{2,}", text)
        word_count = len(words)

    if word_count > 0 and word_count < 200:
        findings.append(
            Finding(
                category="content",
                code="thin_content",
                title=f"Page is thin ({word_count} words)",
                detail=(
                    "Pages under 200 words rarely rank for competitive queries. "
                    "Answer engines (Perplexity, ChatGPT, Claude) also prefer longer, "
                    "definition-rich content for citations."
                ),
                suggestion="Expand the main content to 600+ words with H2/H3 sections, FAQ blocks, and examples.",
                severity="warning",
                impact="high",
            )
        )
        score -= 20

    images = soup.find_all("img")
    image_count = len(images)
    for img in images:
        alt = (img.get("alt") or "").strip()
        if not alt:
            image_without_alt_count += 1

    if image_count > 0:
        ratio = image_without_alt_count / image_count
        if ratio > 0.3:
            findings.append(
                Finding(
                    category="content",
                    code="missing_image_alts",
                    title=f"{image_without_alt_count} of {image_count} images lack alt text",
                    detail=(
                        "Image alt text is a ranking signal AND a hard accessibility "
                        "requirement (WCAG 1.1.1). Screen readers skip imageless alts."
                    ),
                    suggestion="Add a descriptive alt='' attribute to every meaningful image. Decorative images can use alt=''.",
                    severity="warning",
                    impact="medium",
                )
            )
            score -= 10

    parsed_origin = None
    base_tag = soup.find("base", href=True)
    if base_tag:
        parsed_origin = urlparse(base_tag["href"]).netloc
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
            continue
        try:
            netloc = urlparse(href).netloc
        except Exception:
            continue
        if not netloc or (parsed_origin and netloc == parsed_origin):
            internal_link_count += 1
        else:
            external_link_count += 1

    if internal_link_count + external_link_count == 0 and word_count > 100:
        findings.append(
            Finding(
                category="content",
                code="no_links",
                title="Page has no outgoing links",
                detail=(
                    "Internal links pass link equity around your site; outbound links "
                    "to authoritative sources signal trust to search engines."
                ),
                suggestion="Add 3–5 internal links to related pages and 1–2 outbound citations.",
                severity="info",
                impact="medium",
            )
        )
        score -= 8

    return (
        findings,
        max(score, 0),
        word_count,
        image_count,
        image_without_alt_count,
        internal_link_count,
        external_link_count,
    )


def _check_schema(
    *,
    soup: Optional[BeautifulSoup],
) -> tuple[list[Finding], int, list[str], dict[str, str], dict[str, str]]:
    """JSON-LD detection + Open Graph + Twitter."""
    findings: list[Finding] = []
    score = 100
    detected_types: list[str] = []
    open_graph: dict[str, str] = {}
    twitter: dict[str, str] = {}

    if soup is None:
        return [], 0, [], {}, {}

    for s in soup.find_all("script", type=lambda t: t and "ld+json" in t):
        text = s.string or ""
        # Cheap type extraction — we don't bother fully parsing; just regex the
        # @type values. JSON-LD blocks may contain arrays of objects.
        for m in re.finditer(r'"@type"\s*:\s*"([^"]+)"', text):
            t = m.group(1)
            if t and t not in detected_types:
                detected_types.append(t)

    for m in soup.find_all("meta", attrs={"property": re.compile(r"^og:", re.I)}):
        key = (m.get("property") or "").lower()
        val = (m.get("content") or "").strip()
        if val:
            open_graph[key] = val

    for m in soup.find_all("meta", attrs={"name": re.compile(r"^twitter:", re.I)}):
        key = (m.get("name") or "").lower()
        val = (m.get("content") or "").strip()
        if val:
            twitter[key] = val

    if not detected_types:
        findings.append(
            Finding(
                category="schema",
                code="no_jsonld",
                title="No JSON-LD structured data found",
                detail=(
                    "Schema.org JSON-LD is the single most underused SEO/AEO win. "
                    "Adding it unlocks rich snippets in Google and clean citations "
                    "in Perplexity / ChatGPT."
                ),
                suggestion=(
                    "At minimum, add Organization (or LocalBusiness if you have a "
                    "physical address) and BreadcrumbList. Use Google's Rich Results Test to validate."
                ),
                severity="warning",
                impact="high",
            )
        )
        score -= 25
    else:
        # Recommend specific high-value schemas if missing.
        recommendations = []
        types_lower = {t.lower() for t in detected_types}
        if not (types_lower & {"organization", "localbusiness", "store", "restaurant"}):
            recommendations.append("Organization (or LocalBusiness for storefronts)")
        if "breadcrumblist" not in types_lower:
            recommendations.append("BreadcrumbList")
        if "faqpage" not in types_lower and "howto" not in types_lower:
            recommendations.append("FAQPage or HowTo (high AEO impact)")
        if recommendations:
            findings.append(
                Finding(
                    category="schema",
                    code="incomplete_schema",
                    title=f"Schema detected ({len(detected_types)}) but missing: {', '.join(recommendations[:3])}",
                    detail="Schema coverage gaps reduce your eligibility for rich snippets and citations.",
                    suggestion=f"Add the missing schemas: {', '.join(recommendations)}.",
                    severity="info",
                    impact="medium",
                )
            )
            score -= 8

    return findings, max(score, 0), detected_types, open_graph, twitter


def _check_performance(
    *,
    soup: Optional[BeautifulSoup],
    html_size: int,
) -> tuple[list[Finding], int]:
    """Approximation — we don't run Lighthouse; we estimate via HTML signals."""
    findings: list[Finding] = []
    score = 100

    if soup is None:
        return [], 0

    # HTML size — anything over ~500 KB is heavy for a homepage.
    if html_size > 700_000:
        findings.append(
            Finding(
                category="performance",
                code="heavy_html",
                title=f"HTML document is heavy ({html_size // 1024} KB)",
                detail=(
                    "Large HTML payloads delay First Contentful Paint, especially on 4G. "
                    "Most often caused by inlined CSS, base64 images, or long Tailwind "
                    "class lists from over-eager component libraries."
                ),
                suggestion="Move CSS to external stylesheets (cacheable), lazy-load images, and check for runaway component duplication.",
                severity="warning",
                impact="medium",
            )
        )
        score -= 12
    elif html_size > 400_000:
        score -= 5

    inline_scripts = [
        s for s in soup.find_all("script") if not s.get("src") and (s.string or "").strip()
    ]
    inline_script_bytes = sum(len((s.string or "")) for s in inline_scripts)
    if inline_script_bytes > 100_000:
        findings.append(
            Finding(
                category="performance",
                code="heavy_inline_js",
                title=f"~{inline_script_bytes // 1024} KB of inline JavaScript",
                detail="Inline JS blocks rendering and can't be cached across pages.",
                suggestion="Move large scripts to external files; use defer / type='module' to avoid render-blocking.",
                severity="info",
                impact="medium",
            )
        )
        score -= 8

    inline_styles = [s for s in soup.find_all("style") if (s.string or "").strip()]
    inline_style_bytes = sum(len((s.string or "")) for s in inline_styles)
    if inline_style_bytes > 50_000:
        findings.append(
            Finding(
                category="performance",
                code="heavy_inline_css",
                title=f"~{inline_style_bytes // 1024} KB of inline CSS",
                detail="Inlining critical CSS is fine; inlining your full stylesheet defeats caching.",
                suggestion="Inline only above-the-fold critical CSS; load the rest via <link rel='stylesheet'>.",
                severity="info",
                impact="low",
            )
        )
        score -= 5

    if not soup.find("link", rel="preconnect"):
        findings.append(
            Finding(
                category="performance",
                code="no_preconnect",
                title="No <link rel='preconnect'> hints",
                detail="Preconnecting to your CDN, fonts, and analytics endpoints shaves 50–250ms off LCP.",
                suggestion="Add <link rel='preconnect'> for every cross-origin domain you load assets from.",
                severity="info",
                impact="low",
            )
        )
        score -= 4

    # Lazy loading audit
    eager_count = 0
    for img in soup.find_all("img"):
        loading = (img.get("loading") or "").lower()
        if loading != "lazy":
            eager_count += 1
    if eager_count > 8:
        findings.append(
            Finding(
                category="performance",
                code="few_lazy_images",
                title=f"{eager_count} images load eagerly",
                detail="Eager-loading images below the fold delays LCP and wastes mobile data.",
                suggestion="Add loading='lazy' decoding='async' to every image not in the hero/above-the-fold area.",
                severity="info",
                impact="medium",
            )
        )
        score -= 6

    return findings, max(score, 0)


def _check_mobile_a11y(
    *,
    soup: Optional[BeautifulSoup],
    image_without_alt_count: int,
    image_count: int,
) -> tuple[list[Finding], int, list[Finding], int]:
    """Returns (mobile_findings, mobile_score, a11y_findings, a11y_score)."""
    mobile_findings: list[Finding] = []
    a11y_findings: list[Finding] = []
    mobile_score = 100
    a11y_score = 100

    if soup is None:
        return [], 0, [], 0

    if not soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)}):
        mobile_findings.append(
            Finding(
                category="mobile",
                code="no_viewport",
                title="No <meta name='viewport'> tag",
                detail="Without a viewport tag, mobile browsers render at desktop width and shrink — unusable on phones.",
                suggestion="Add <meta name='viewport' content='width=device-width, initial-scale=1'> to <head>.",
                severity="critical",
                impact="high",
            )
        )
        mobile_score -= 30

    html_tag = soup.find("html")
    lang = (html_tag.get("lang") if html_tag else None) or ""
    if not lang.strip():
        a11y_findings.append(
            Finding(
                category="accessibility",
                code="no_html_lang",
                title="<html> tag has no lang attribute",
                detail="Screen readers and translators rely on lang to choose the correct voice / language.",
                suggestion="Add lang='en' (or your language code) to the <html> tag.",
                severity="warning",
                impact="medium",
            )
        )
        a11y_score -= 12

    if image_count > 0 and (image_without_alt_count / image_count) > 0.3:
        # Already counted in content category; mirror as a11y impact too.
        a11y_findings.append(
            Finding(
                category="accessibility",
                code="missing_alts_a11y",
                title=f"{image_without_alt_count} images missing alt text",
                detail="WCAG 1.1.1 requires text alternatives for non-text content.",
                suggestion="Add descriptive alt='' on meaningful images; use alt='' (empty) only for purely decorative ones.",
                severity="warning",
                impact="high",
            )
        )
        a11y_score -= 15

    # Form labels
    forms = soup.find_all("form")
    unlabeled = 0
    total_inputs = 0
    for f in forms:
        for inp in f.find_all(["input", "textarea", "select"]):
            if (inp.get("type") or "").lower() in {"hidden", "submit", "button"}:
                continue
            total_inputs += 1
            input_id = inp.get("id")
            has_label = False
            if input_id:
                if soup.find("label", attrs={"for": input_id}):
                    has_label = True
            if inp.find_parent("label"):
                has_label = True
            if (inp.get("aria-label") or "").strip():
                has_label = True
            if (inp.get("aria-labelledby") or "").strip():
                has_label = True
            if not has_label:
                unlabeled += 1
    if total_inputs > 0 and unlabeled > 0:
        a11y_findings.append(
            Finding(
                category="accessibility",
                code="unlabeled_form_inputs",
                title=f"{unlabeled} of {total_inputs} form inputs lack labels",
                detail="Screen reader users can't determine what to type into unlabeled inputs.",
                suggestion="Wrap inputs in <label> or use <label for='id'>, or add aria-label attributes.",
                severity="warning",
                impact="medium",
            )
        )
        a11y_score -= 10

    return mobile_findings, max(mobile_score, 0), a11y_findings, max(a11y_score, 0)


def _check_trust(
    *,
    soup: Optional[BeautifulSoup],
    has_ssl: bool,
    socials_found: bool,
    copyright_year: Optional[int],
) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    score = 100

    if soup is None:
        return [], 0

    if not has_ssl:
        # Already counted in indexability — mirror lightly here.
        score -= 15

    body_text = soup.get_text(separator=" ", strip=True).lower()
    has_privacy = bool(re.search(r"privacy\s*policy|/privacy", body_text))
    has_terms = bool(re.search(r"terms\s*(of\s*service|of\s*use|&\s*conditions)|/terms|/tos", body_text))
    has_email = bool(re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", body_text))
    has_phone = bool(re.search(r"(\+?\d[\d\-\s().]{6,}\d)", body_text))

    if not has_privacy:
        findings.append(
            Finding(
                category="trust",
                code="no_privacy_link",
                title="No Privacy Policy link found",
                detail=(
                    "Required by GDPR (EU), CCPA (California), and most analytics SDKs' "
                    "ToS. Visitors actively look for it before purchasing."
                ),
                suggestion="Publish a /privacy page and link it from the footer of every page.",
                severity="warning",
                impact="high",
            )
        )
        score -= 12

    if not has_terms:
        findings.append(
            Finding(
                category="trust",
                code="no_terms_link",
                title="No Terms of Service link found",
                detail="ToS protect you legally and signal a real business.",
                suggestion="Publish a /terms page and link from the footer.",
                severity="info",
                impact="medium",
            )
        )
        score -= 6

    if not has_email and not has_phone:
        findings.append(
            Finding(
                category="trust",
                code="no_contact_info",
                title="No visible email or phone",
                detail=(
                    "Hidden contact info hurts NAP (name-address-phone) consistency for "
                    "local SEO and erodes trust for first-time visitors."
                ),
                suggestion="Display business email and/or phone in the footer or a /contact page.",
                severity="warning",
                impact="medium",
            )
        )
        score -= 10

    if not socials_found:
        findings.append(
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
        score -= 6

    if copyright_year is not None:
        gap = date.today().year - copyright_year
        if gap >= 2:
            findings.append(
                Finding(
                    category="trust",
                    code="stale_copyright",
                    title=f"Copyright stuck on {copyright_year}",
                    detail="Visitors and Google read stale footers as 'business is no longer active'.",
                    suggestion="Auto-update the copyright year in your footer template using server-side or JS dynamic year.",
                    severity="warning",
                    impact="low",
                )
            )
            score -= 6

    return findings, max(score, 0)


def _check_aeo(
    *,
    soup: Optional[BeautifulSoup],
    detected_schemas: list[str],
    has_llms_txt: bool,
) -> tuple[list[Finding], int]:
    """Answer Engine Optimization — what makes a site cite-able by Perplexity / ChatGPT / Claude."""
    findings: list[Finding] = []
    score = 100

    if soup is None:
        return [], 0

    schema_lower = {s.lower() for s in detected_schemas}

    if not has_llms_txt:
        findings.append(
            Finding(
                category="aeo",
                code="no_llms_txt",
                title="No /llms.txt file",
                detail=(
                    "llms.txt is the emerging standard for telling AI agents what your "
                    "site is, what they may use, and where to find clean docs. Cited by "
                    "Anthropic, Mintlify, and growing fast."
                ),
                suggestion="Add a /llms.txt with a short summary, sitemap of public pages, and AI agent policy. See llmstxt.org.",
                severity="info",
                impact="medium",
            )
        )
        score -= 10

    if "faqpage" not in schema_lower:
        findings.append(
            Finding(
                category="aeo",
                code="no_faqpage",
                title="No FAQPage schema",
                detail=(
                    "Answer engines pull verbatim from FAQPage JSON-LD because it's "
                    "explicitly Q&A-shaped. Single biggest AEO win for B2B sites."
                ),
                suggestion="Pick 5–8 real customer questions and mark them up with FAQPage JSON-LD. Validate via Google's Rich Results Test.",
                severity="warning",
                impact="high",
            )
        )
        score -= 18

    if "howto" not in schema_lower:
        findings.append(
            Finding(
                category="aeo",
                code="no_howto",
                title="No HowTo schema",
                detail="HowTo schema turns instructional content into citable steps for answer engines.",
                suggestion="If you have any 'how to X' pages, mark them up with HowTo JSON-LD.",
                severity="info",
                impact="medium",
            )
        )
        score -= 6

    if "speakablespecification" not in schema_lower:
        findings.append(
            Finding(
                category="aeo",
                code="no_speakable",
                title="No speakable specification",
                detail="Voice assistants (Siri, Alexa, Google Assistant) prefer pages with explicit speakable hints.",
                suggestion="Add a SpeakableSpecification block to your WebPage JSON-LD pointing at your H1 + summary.",
                severity="info",
                impact="low",
            )
        )
        score -= 4

    # Scan for an FAQ-shaped block of text even if schema is missing.
    body_text = soup.get_text(separator=" ", strip=True)
    has_qa_block = bool(
        re.search(r"\bFAQ|frequently asked questions\b", body_text, re.I)
    )
    if has_qa_block and "faqpage" not in schema_lower:
        # Already added a finding above; no need to penalize twice.
        pass

    return findings, max(score, 0)


# ── Top-level orchestrator ─────────────────────────────────────────────────


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


def _summary_for(grade: str, top_findings: list[Finding]) -> str:
    if grade == "A+":
        return "Excellent — the fundamentals are tight. Polish remaining items and double down on AEO."
    if grade == "A":
        return "Strong overall. A few targeted improvements will push you above competitors."
    if grade == "B":
        return "Solid foundation. Address the warning-level items in priority order to unlock more traffic."
    if grade == "C":
        return "Mixed bag. Several high-impact issues are holding the site back — start with the criticals."
    if grade == "D":
        return "Significant gaps. Prioritize fixing critical SEO + trust signals before any other marketing spend."
    return "Severe issues. Most search engines and answer engines will deprioritize this site as-is."


async def run_deep_audit(
    raw_url: str,
    *,
    socials_found: bool = False,
) -> Optional[DeepAudit]:
    """Run every check and assemble the response. Returns ``None`` if the URL is invalid."""
    normalized = _normalize_url(raw_url)
    if normalized is None:
        return None

    fetched_at_iso = (
        __import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    )

    parsed = urlparse(normalized)
    origin = f"{parsed.scheme}://{parsed.netloc}"

    # All HTTP work shares one client to reuse keep-alive connections.
    async with httpx.AsyncClient(
        verify=False,
        headers=_DEFAULT_HEADERS,
        follow_redirects=True,
        limits=httpx.Limits(max_keepalive_connections=2, max_connections=4),
    ) as client:
        # 1. Main page fetch
        resp, chain = await _fetch(client, normalized, timeout=10.0)

        # 2. Side requests in parallel — these tolerate failure.
        import asyncio as _asyncio

        robots_ok, sitemap_ok, llms_ok = await _asyncio.gather(
            _head_ok(client, urljoin(origin, "/robots.txt")),
            _head_ok(client, urljoin(origin, "/sitemap.xml")),
            _head_ok(client, urljoin(origin, "/llms.txt")),
        )

    is_dns_valid = resp is not None
    is_http_valid = bool(resp and resp.status_code < 400)
    final_url = str(resp.url) if resp else normalized
    has_ssl = final_url.lower().startswith("https://")

    soup: Optional[BeautifulSoup] = None
    body_html = ""
    if resp is not None and is_http_valid:
        try:
            body_html = resp.text
            soup = BeautifulSoup(body_html, "html.parser")
        except Exception as e:
            logger.debug(f"BeautifulSoup parse failed for {final_url}: {e!r}")

    title = None
    description = None
    canonical = None
    copyright_year = None
    if soup:
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else None
        d = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
        description = (d.get("content") if d else None) or None
        c = soup.find("link", rel="canonical")
        canonical = (c.get("href") if c else None) or None
        m = re.findall(r"©\s*(\d{4})", soup.get_text(separator=" ", strip=True))
        if m:
            copyright_year = max(int(y) for y in m)

    # Run each category check.
    idx_findings, idx_score = _check_indexability(
        final_url=final_url,
        soup=soup,
        has_robots_txt=robots_ok,
        has_sitemap_referenced=sitemap_ok,
        is_https=has_ssl,
    )
    meta_findings, meta_score = _check_meta(soup=soup)
    head_findings, head_score = _check_headings(soup=soup)
    (
        content_findings,
        content_score,
        word_count,
        image_count,
        image_without_alt_count,
        internal_links,
        external_links,
    ) = _check_content(soup=soup)
    schema_findings, schema_score, detected_schemas, og, tw = _check_schema(soup=soup)
    perf_findings, perf_score = _check_performance(
        soup=soup,
        html_size=len(body_html),
    )
    mobile_findings, mobile_score, a11y_findings, a11y_score = _check_mobile_a11y(
        soup=soup,
        image_without_alt_count=image_without_alt_count,
        image_count=image_count,
    )
    trust_findings, trust_score = _check_trust(
        soup=soup,
        has_ssl=has_ssl,
        socials_found=socials_found,
        copyright_year=copyright_year,
    )
    aeo_findings, aeo_score = _check_aeo(
        soup=soup,
        detected_schemas=detected_schemas,
        has_llms_txt=llms_ok,
    )

    findings = (
        idx_findings
        + meta_findings
        + head_findings
        + content_findings
        + schema_findings
        + perf_findings
        + mobile_findings
        + a11y_findings
        + trust_findings
        + aeo_findings
    )
    # Sort findings: critical first, then by impact.
    severity_rank = {"critical": 0, "warning": 1, "info": 2, "good": 3}
    impact_rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (severity_rank[f.severity], impact_rank[f.impact]))

    # Category scores — weighted to prioritize the categories where most
    # business value is unlocked. Sum of weights = 100.
    weights = {
        "indexability": 14,
        "meta": 12,
        "headings": 8,
        "content": 14,
        "schema": 12,
        "performance": 10,
        "mobile": 8,
        "accessibility": 6,
        "trust": 8,
        "aeo": 8,
    }
    raw_scores = {
        "indexability": idx_score,
        "meta": meta_score,
        "headings": head_score,
        "content": content_score,
        "schema": schema_score,
        "performance": perf_score,
        "mobile": mobile_score,
        "accessibility": a11y_score,
        "trust": trust_score,
        "aeo": aeo_score,
    }
    weighted_total = sum(raw_scores[k] * weights[k] for k in weights) / sum(weights.values())
    overall = max(0, min(100, int(round(weighted_total))))
    if not is_http_valid:
        # Site is offline — cap the score so we never claim a dead site is healthy.
        overall = min(overall, 25)

    grade = _grade_for(overall)
    summary = _summary_for(grade, findings[:3])

    category_scores = []
    for cat, raw in raw_scores.items():
        category_findings = [f for f in findings if f.category == cat]
        headline = (
            "Looking great"
            if not category_findings
            else (
                category_findings[0].title
                if category_findings[0].severity in {"critical", "warning"}
                else "A few minor improvements"
            )
        )
        category_scores.append(
            CategoryScore(
                category=cat,
                score=raw,
                headline=headline,
                findings_count=len(category_findings),
            )
        )

    return DeepAudit(
        url=raw_url,
        normalized_url=normalized,
        final_url=final_url,
        fetched_at_iso=fetched_at_iso,
        is_dns_valid=is_dns_valid,
        is_http_valid=is_http_valid,
        http_status=(resp.status_code if resp else None),
        final_redirect_chain=chain,
        page_title=title,
        meta_description=description,
        canonical=canonical,
        has_ssl=has_ssl,
        overall_score=overall,
        grade=grade,
        summary=summary,
        category_scores=category_scores,
        findings=findings,
        detected_schemas=detected_schemas,
        open_graph=og,
        twitter=tw,
        word_count=word_count,
        image_count=image_count,
        image_without_alt_count=image_without_alt_count,
        internal_link_count=internal_links,
        external_link_count=external_links,
        has_robots_txt=robots_ok,
        has_sitemap_referenced=sitemap_ok,
        has_llms_txt=llms_ok,
    )
