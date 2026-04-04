"""
Web Scraping and Contact Extraction Module.

Fetches HTML from target business websites and extracts contact email
addresses using regular-expression pattern matching.

SSL verification note (verify=False):
  This module deliberately disables TLS certificate verification when
  connecting to target business websites. This is an intentional architectural
  decision because:

    1. Many small and mid-tier business websites operate with expired, self-signed,
       or misconfigured SSL certificates.  Using verify=True would produce false
       negatives — marking reachable sites as unreachable — and silently drop
       valid leads from the pipeline.

    2. The data fetched is publicly accessible HTML (no sensitive payload is
       transmitted *to* the site).  The downside of a MITM attack in this context
       is that an adversary could inject content into the HTML response.  Injected
       content is mitigated further downstream by the prompt-injection sanitisation
       layer in ``groq_client.py`` before any scraped values reach the LLM.

  If stricter validation is ever required, set ``SCRAPER_VERIFY_SSL=true`` in
  the environment and update this module accordingly.
"""

import httpx
from bs4 import BeautifulSoup
import re
from typing import Optional, List
from loguru import logger


async def scrape_contact_email(url: str) -> Optional[str]:
    """
    Executes a direct HTTP GET request to the provided URL and analyzes the raw DOM
    for valid email address patterns, deliberately filtering common false positives.
    
    Args:
        url (str): The target website URL.
        
    Returns:
        Optional[str]: The primary extracted email address if found and validated, otherwise None.
    """
    if not url.startswith("http"):
        url = "http://" + url
        
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        async with httpx.AsyncClient(verify=False, headers=headers) as client:
            response = await client.get(url, timeout=10.0, follow_redirects=True)
            if response.status_code != 200:
                logger.debug(f"Email scrape skipped for {url}: HTTP {response.status_code}")
                return None
            
            email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
            emails = re.findall(email_pattern, response.text)
            
            valid_emails = []
            for e in emails:
                e_lower = e.lower()
                if "wixpress" in e_lower or "sentry" in e_lower or e_lower.endswith(('.png', '.jpg', '.gif', '.jpeg')):
                    continue
                valid_emails.append(e_lower)
                
            return valid_emails[0] if valid_emails else None
            
    except Exception as e:
        logger.debug(f"Failed to scrape email for {url}: {repr(e)}")
        return None
