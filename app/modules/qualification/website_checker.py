"""
Domain validity and HTTP accessibility verification module.
Performs DNS resolution and HTTP health checks on target domains.
"""
import httpx
import dns.resolver
from typing import Tuple
from loguru import logger

async def dns_resolves(domain: str) -> bool:
    """
    Asynchronously queries DNS for A records of a given domain.
    """
    if not domain:
        return False
        
    try:
        domain = domain.replace('http://', '').replace('https://', '')
        domain = domain.split('/')[0]
        
        resolver = dns.resolver.Resolver()
        resolver.timeout = 3
        resolver.lifetime = 3
        
        resolver.resolve(domain, 'A')
        return True
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.LifetimeTimeout):
        return False
    except Exception as e:
        logger.debug(f"DNS Resolution failed for {domain}: {e}")
        return False

async def website_responds(url: str) -> bool:
    """
    Asynchronously executes an HTTP GET request to verify non-error status codes.
    """
    if not url:
        return False
        
    if not url.startswith('http'):
        url = 'http://' + url
        
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        async with httpx.AsyncClient(verify=False, headers=headers) as client:
            response = await client.get(url, timeout=5.0, follow_redirects=True)
            return response.status_code < 400
    except Exception as e:
        logger.debug(f"HTTP Check failed for {url}: {repr(e)}")
        return False

async def check_website(url: str) -> Tuple[bool, bool, str]:
    """
    Orchestrates validation of a domain via DNS resolution followed by an HTTP check.
    """
    if not url:
        return False, False, url
        
    domain = url.replace('http://', '').replace('https://', '').split('/')[0]
    is_dns_valid = await dns_resolves(domain)
    
    if not is_dns_valid:
        return False, False, url
        
    is_http_valid = await website_responds(url)
    return is_dns_valid, is_http_valid, url
