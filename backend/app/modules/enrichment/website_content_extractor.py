"""
Website content extraction module.
Extracts structured signals from a business website for lead scoring
and email personalization.

Playwright is tried first (full JS rendering).
Falls back to httpx if Playwright is unavailable or times out.
httpx fallback always follows redirects (301/302) automatically.
"""
import asyncio
import logging
import re

import httpx
from bs4 import BeautifulSoup
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

_SERVICE_KEYWORDS = [
    "service", "treatment", "consultation", "install", "repair",
    "design", "coaching", "training", "therapy", "clinic", "care",
]

_BOOKING_SIGNALS = [
    "calendly.com", "booksy.info", "vagaro.com", "mindbodyonline.com",
    "fresha.com", "booking", "schedule", "appointment", "book-now",
    "booknow", "reserve",
]

_ECOMMERCE_SIGNALS = ["cart", "checkout", "shop", "store", "buy", "add-to-cart"]

# Matches any 4-digit year from 2000 onwards in a copyright notice.
# Intentionally broad — stale years (2015, 2018) are important scoring signals.
_COPYRIGHT_RE = re.compile(r"(?:copyright|©)[^\d]{0,20}(20\d{2})", re.IGNORECASE)


# ── Public interface ──────────────────────────────────────────────────────────

async def extract_website_content(url: str) -> dict:
    """
    Extracts structured content signals from a business website.

    Strategy:
        1. Try Playwright (full JS rendering, accurate viewport detection).
        2. On any Playwright failure (not installed, timeout, crash),
           fall back to httpx with follow_redirects=True.

    Args:
        url (str): Target website URL.

    Returns:
        dict with keys:
            page_title (str|None)
            meta_description (str|None)
            h1_headings (list[str])
            services_mentioned (list[str])
            about_text (str|None)
            has_online_booking (bool)
            has_ecommerce (bool)
            copyright_year (int|None)    — oldest year wins for stale-site detection
            is_mobile_responsive (bool)
            page_load_ms (int)
    """
    if not url.startswith("http"):
        url = "http://" + url

    result = {
        "page_title":          None,
        "meta_description":    None,
        "h1_headings":         [],
        "services_mentioned":  [],
        "about_text":          None,
        "has_online_booking":  False,
        "has_ecommerce":       False,
        "copyright_year":      None,
        "is_mobile_responsive": True,   # assume true; set False only on evidence
        "page_load_ms":        0,
    }

    start_time   = asyncio.get_event_loop().time()
    html_content = ""

    # ── 1. Playwright (preferred) ─────────────────────────────────────────────
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=_USER_AGENT,
                ignore_https_errors=True,
            )
            page = await context.new_page()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=8000)
                html_content = await page.content()

                viewport_meta = await page.evaluate(
                    "() => { "
                    "  const m = document.querySelector('meta[name=\"viewport\"]'); "
                    "  return m ? m.content : null; "
                    "}"
                )
                if not viewport_meta or "width=device-width" not in viewport_meta:
                    result["is_mobile_responsive"] = False

            except PlaywrightTimeoutError:
                logger.warning(f"Playwright timeout for {url}, falling back to httpx")
            finally:
                await browser.close()

    except Exception as e:
        logger.error(f"Playwright failed for {url}: {e}, falling back to httpx")

    # ── 2. httpx fallback ─────────────────────────────────────────────────────
    # BUG FIX: follow_redirects=True added — previously raised an exception on
    # any 301/302 redirect (http → https, www → non-www, etc.), causing the
    # entire extraction to silently return an empty result dict.
    if not html_content:
        try:
            async with httpx.AsyncClient(
                verify=False,
                follow_redirects=True,          # ← the fix
                headers={"User-Agent": _USER_AGENT},
            ) as client:
                res = await client.get(url, timeout=10.0)
                res.raise_for_status()
                html_content = res.text

                # Best-effort mobile check via httpx (no JS execution available)
                if "viewport" not in html_content.lower():
                    result["is_mobile_responsive"] = False

        except Exception as e:
            logger.error(f"Fallback httpx failed for {url}: {e}")
            return result

    result["page_load_ms"] = int(
        (asyncio.get_event_loop().time() - start_time) * 1000
    )

    # ── Parse HTML ────────────────────────────────────────────────────────────
    soup = BeautifulSoup(html_content, "html.parser")

    # Title
    if soup.title and soup.title.string:
        result["page_title"] = soup.title.string.strip()[:255]

    # Meta description
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc and meta_desc.get("content"):
        result["meta_description"] = str(meta_desc["content"]).strip()[:500]

    # H1 headings (first 3)
    result["h1_headings"] = [
        h.get_text(strip=True)
        for h in soup.find_all("h1")
        if h.get_text(strip=True)
    ][:3]

    # Service keywords in full page text
    text_lower = soup.get_text(separator=" ", strip=True).lower()
    result["services_mentioned"] = [
        kw for kw in _SERVICE_KEYWORDS if kw in text_lower
    ]

    # About section snippet
    about = (
        soup.find(id=re.compile("about", re.I))
        or soup.find(class_=re.compile("about", re.I))
    )
    if about:
        result["about_text"] = about.get_text(separator=" ", strip=True)[:500]

    # Booking / ecommerce signals from links
    links = [
        a.get("href", "").lower()
        for a in soup.find_all("a")
        if a.get("href")
    ]
    for link in links:
        if any(b in link for b in _BOOKING_SIGNALS):
            result["has_online_booking"] = True
        if any(e in link for e in _ECOMMERCE_SIGNALS):
            result["has_ecommerce"] = True

    # Copyright year
    # BUG FIX: was `202\d` — only matched 2020–2029.
    # Changed to `20\d{2}` to also catch stale years like 2014–2019,
    # which are the most valuable signal (severely outdated site).
    # We take the OLDEST year found (most conservative stale-site signal).
    year_matches = _COPYRIGHT_RE.findall(text_lower)
    if year_matches:
        years = [int(y) for y in year_matches if y.isdigit()]
        if years:
            result["copyright_year"] = min(years)   # oldest year = most stale

    return result