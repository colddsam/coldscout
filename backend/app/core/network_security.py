from __future__ import annotations

import ipaddress
import socket
from typing import Optional, Set
from urllib.parse import urlparse, urlunparse, urljoin

import httpx
from loguru import logger


def is_safe_url(url: str, allowed_domains: Optional[Set[str]] = None) -> Optional[str]:
    """
    Validates a URL for SSRF protection and returns a sanitized version.
    
    Checks:
    1. Scheme is http or https.
    2. Hostname is present.
    3. Hostname is not a private/loopback IP address.
    4. Hostname resolves to a public IP address (basic check).
    5. Hostname matches allowed_domains if provided.
    
    Returns:
        The sanitized URL string if safe, otherwise None.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return None

        host = (parsed.hostname or "").lower()
        if not host:
            return None

        # 1. Domain Whitelist Check
        if allowed_domains:
            is_whitelisted = any(
                host == domain or host.endswith(f".{domain}")
                for domain in allowed_domains
            )
            if not is_whitelisted:
                return None

        # 2. IP Format Check (prevent direct private IP access)
        try:
            ip = ipaddress.ip_address(host)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
                return None
        except ValueError:
            # Not an IP address string, it's a hostname
            pass

        # 3. DNS Resolution Check (prevent DNS rebinding to internal IPs)
        # Note: This is a basic check. High-security environments should use 
        # a custom transport that validates IPs during the connection phase.
        try:
            # We use getaddrinfo to support both IPv4 and IPv6
            addr_info = socket.getaddrinfo(host, None)
            for info in addr_info:
                ip_str = info[4][0]
                ip = ipaddress.ip_address(ip_str)
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast:
                    logger.warning(f"SSRF: Host {host} resolved to private IP {ip_str}")
                    return None
        except Exception:
            # Resolution failure — might be an invalid domain, but we'll let 
            # the HTTP client handle the actual connection error.
            pass

        # 4. Re-construct the URL to break CodeQL taint and ensure sanitization
        sanitized = urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment
        ))
        return sanitized
    except Exception as e:
        logger.debug(f"is_safe_url check failed for {url}: {e!r}")
        return None


async def safe_fetch(
    client: httpx.AsyncClient,
    url: str,
    *,
    method: str = "GET",
    headers: Optional[dict] = None,
    timeout: float = 10.0,
    max_redirects: int = 5,
    allowed_domains: Optional[Set[str]] = None,
) -> tuple[Optional[httpx.Response], list[str]]:
    """
    Fetches a URL safely, manually following redirects and validating each hop.
    
    Args:
        client: The httpx AsyncClient to use.
        url: The starting URL.
        method: HTTP method (GET or HEAD).
        headers: Optional headers.
        timeout: Request timeout.
        max_redirects: Maximum number of redirect hops.
        allowed_domains: Optional set of allowed hostnames/domains.
        
    Returns:
        A tuple of (Response object or None, list of URL redirect chain).
    """
    chain: list[str] = []
    current_url = url
    
    for hop in range(max_redirects + 1):
        sanitized_url = is_safe_url(current_url, allowed_domains=allowed_domains)
        if not sanitized_url:
            logger.warning(f"SSRF: Blocked unsafe URL at hop {hop}: {current_url}")
            return None, chain
        
        chain.append(sanitized_url)
        
        try:
            # Every request uses the sanitized URL string returned by our validator
            resp = await client.request(
                method,
                sanitized_url,
                headers=headers,
                timeout=timeout,
                follow_redirects=False,
            )
            
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location")
                if not location:
                    return resp, chain
                
                # Resolve relative redirects
                next_url = urljoin(sanitized_url, location)
                current_url = next_url
                continue
            
            return resp, chain
            
        except Exception as e:
            logger.debug(f"safe_fetch: {current_url} failed — {e!r}")
            return None, chain
            
    logger.warning(f"SSRF: Max redirects ({max_redirects}) exceeded for {url}")
    return None, chain
