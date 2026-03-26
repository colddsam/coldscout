"""
Domain validity and HTTP accessibility verification module.

This module performs DNS resolution, HTTP health checks, and basic quality signals
on target business domains. It is designed to be used in a concurrent environment
to efficiently verify the reachability and responsiveness of multiple websites.

Author: [Your Name]
Date: [Today's Date]
"""

import re
import httpx
import dns.resolver
from typing import Tuple
from loguru import logger

# List of free website builder domains that may not require a real site
FREE_BUILDER_DOMAINS = (
    "wixsite.com", "wix.com", "weebly.com", "blogspot.com",
    "wordpress.com", "site123.me", "godaddysites.com",
    "squarespace.com", "jimdo.com", "webnode.com",
    "strikingly.com", "yolasite.com", "webflow.io",
)

# Default HTTP headers used for website checks
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.5",
}


async def dns_resolves(domain: str) -> bool:
    """
    Asynchronously queries DNS A records for a domain.

    Args:
        domain (str): Bare domain name (no scheme, no path).

    Returns:
        bool: True if at least one A record exists.
    """
    # Check if the domain is empty
    if not domain:
        return False

    try:
        # Remove any scheme or path from the domain
        domain = (
            domain.replace("http://", "")
            .replace("https://", "")
            .split("/")[0]
        )
        # Create a DNS resolver with a timeout of 3 seconds
        resolver = dns.resolver.Resolver()
        resolver.timeout = 3
        resolver.lifetime = 3
        # Resolve the domain's A records
        resolver.resolve(domain, "A")
        return True
    except (
        dns.resolver.NXDOMAIN,  # Domain does not exist
        dns.resolver.NoAnswer,  # No A records found
        dns.resolver.LifetimeTimeout,  # DNS query timed out
    ):
        return False
    except Exception as e:
        # Log any unexpected DNS resolution errors
        logger.debug(f"DNS resolution failed for {domain}: {e}")
        return False


async def website_responds(url: str) -> bool:
    """
    Asynchronously executes an HTTP GET to verify a non-error status code.

    Args:
        url (str): Full website URL.

    Returns:
        bool: True if HTTP status < 400.
    """
    # Check if the URL is empty
    if not url:
        return False

    # Ensure the URL starts with a scheme
    if not url.startswith("http"):
        url = "http://" + url

    try:
        # Create an HTTP client with default headers and no SSL verification
        async with httpx.AsyncClient(
            verify=False, headers=_DEFAULT_HEADERS
        ) as client:
            # Send an HTTP GET request to the URL with a timeout of 8 seconds
            response = await client.get(url, timeout=8.0, follow_redirects=True)
            # Return True if the HTTP status code is < 400
            return response.status_code < 400
    except Exception as e:
        # Log any unexpected HTTP check errors
        logger.debug(f"HTTP check failed for {url}: {repr(e)}")
        return False


async def get_website_quality(url: str) -> dict:
    """
    Fetches a live website and extracts quality signals used for lead scoring.

    Only call this when the site is already confirmed reachable (is_http_valid=True)
    to avoid a redundant failing request.

    Args:
        url (str): Full website URL.

    Returns:
        dict with keys:
            has_ssl (bool)            — URL uses HTTPS
            is_mobile_friendly (bool) — Has a viewport meta tag
            is_free_builder (bool)    — Hosted on Wix, Weebly, etc.
            copyright_year (int|None) — Most recent year in copyright notice
            responded (bool)          — Site returned 2xx/3xx
    """
    # Initialize the result dictionary with default values
    result = {
        "has_ssl": False,
        "is_mobile_friendly": False,
        "is_free_builder": False,
        "copyright_year": None,
        "responded": False,
    }

    # Check if the URL is empty
    if not url:
        return result

    # Ensure the URL starts with a scheme
    if not url.startswith("http"):
        url = "http://" + url

    # Check if the URL uses HTTPS
    result["has_ssl"] = url.lower().startswith("https")

    # Check if the URL is hosted on a free website builder
    result["is_free_builder"] = any(b in url.lower() for b in FREE_BUILDER_DOMAINS)

    try:
        # Create an HTTP client with default headers and no SSL verification
        async with httpx.AsyncClient(
            verify=False, headers=_DEFAULT_HEADERS
        ) as client:
            # Send an HTTP GET request to the URL with a timeout of 8 seconds
            response = await client.get(url, timeout=8.0, follow_redirects=True)
            # Check if the HTTP status code is < 400
            if response.status_code < 400:
                # Mark the site as having responded
                result["responded"] = True
                # Parse the HTML response
                html = response.text
                # Check if the site has a viewport meta tag
                result["is_mobile_friendly"] = "viewport" in html.lower()
                # Extract the most recent copyright year from the HTML
                years = re.findall(r"©\s*(\d{4})", html)
                if years:
                    result["copyright_year"] = max(int(y) for y in years)
    except Exception as e:
        # Log any unexpected quality check errors
        logger.debug(f"Quality check failed for {url}: {repr(e)}")

    return result


async def check_website(url: str) -> Tuple[bool, bool, str]:
    """
    Orchestrates DNS resolution followed by an HTTP reachability check.

    Args:
        url (str): The website URL to check.

    Returns:
        Tuple[bool, bool, str]:
            - is_dns_valid: Domain resolves in DNS.
            - is_http_valid: Site returns a non-error HTTP response.
            - url: The original URL (unchanged).
    """
    # Check if the URL is empty
    if not url:
        return False, False, url

    # Extract the domain from the URL
    domain = url.replace("http://", "").replace("https://", "").split("/")[0]
    # Check if the domain resolves in DNS
    is_dns_valid = await dns_resolves(domain)

    # If the domain does not resolve, return immediately
    if not is_dns_valid:
        return False, False, url

    # Check if the site returns a non-error HTTP response
    is_http_valid = await website_responds(url)
    return is_dns_valid, is_http_valid, url