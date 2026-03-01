"""
Web scraping and data extraction module.
Utilizes asynchronous HTTP requests and regular expressions to extract
contact information from targeted business domains.
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
