"""
Social media presence verification module.
Analyzes target domain DOMs to identify social media profiles.
"""
import re
import httpx
from bs4 import BeautifulSoup
from typing import Tuple, List, Dict
from loguru import logger

# Compiled regex patterns — require a trailing slash after the platform domain
# to prevent false positives (e.g. 'x.com' inside 'example.com' or 'expedia.com')
SOCIAL_PATTERNS: Dict[str, re.Pattern] = {
    "facebook":  re.compile(r"(facebook\.com|fb\.com)/", re.IGNORECASE),
    "instagram": re.compile(r"instagram\.com/", re.IGNORECASE),
    "linkedin":  re.compile(r"linkedin\.com/", re.IGNORECASE),
    "twitter":   re.compile(r"(twitter\.com|(?<![a-z0-9\-])x\.com)/", re.IGNORECASE),
    "youtube":   re.compile(r"(youtube\.com|youtu\.be)/", re.IGNORECASE),
    "tiktok":    re.compile(r"tiktok\.com/", re.IGNORECASE),
    "pinterest": re.compile(r"(pinterest\.com|pin\.it)/", re.IGNORECASE),
}


async def check_social_media(url: str) -> Tuple[bool, List[Dict[str, str]]]:
    """
    Asynchronously fetches and parses a website's DOM for validated
    social media platform links.

    Args:
        url (str): The target website URL to scan.

    Returns:
        Tuple[bool, List[Dict[str, str]]]:
            - bool: True if at least one social profile was found.
            - list: Deduplicated list of dicts with keys
                    'platform' and 'url'.
                    Returns an empty list on failure or no socials found.
    """
    if not url:
        return False, []

    if not url.startswith("http"):
        url = "http://" + url

    try:
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.get(
                url,
                timeout=10.0,
                follow_redirects=True,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    )
                },
            )
            if response.status_code != 200:
                logger.debug(
                    f"Social check skipped for {url}: HTTP {response.status_code}"
                )
                return False, []

            soup = BeautifulSoup(response.text, "html.parser")
            links = soup.find_all("a", href=True)

            social_profiles: List[Dict[str, str]] = []
            seen_urls: set = set()
            seen_platforms: set = set()

            for link in links:
                href_raw: str = link["href"]
                href_lower: str = href_raw.lower()

                for platform, pattern in SOCIAL_PATTERNS.items():
                    if pattern.search(href_lower):
                        # One entry per platform maximum, deduplicated by URL
                        if (
                            href_raw not in seen_urls
                            and platform not in seen_platforms
                        ):
                            seen_urls.add(href_raw)
                            seen_platforms.add(platform)
                            social_profiles.append(
                                {
                                    "platform": platform,
                                    "url": href_raw,
                                }
                            )
                        break  # a single link can only match one platform

            return bool(social_profiles), social_profiles

    except Exception as e:
        logger.debug(f"Social check failed for {url}: {repr(e)}")
        return False, []