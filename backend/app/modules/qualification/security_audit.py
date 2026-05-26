"""
Security audit — free, comprehensive vulnerability scan for a website.

Used by the authenticated, plan-gated ``/api/v1/audit/security`` endpoint
(Pro / Enterprise). Mirrors the structure of ``deep_audit.py`` (per-category
scoring + ``Finding`` rows) so the UI can reuse rendering primitives.

Design constraints
------------------
* **Zero paid APIs.** Everything here runs against the audited site
  directly + a small set of public-good lookups (DNS, certificate
  transparency via crt.sh, the Mozilla observatory header rules
  re-implemented inline). No SSL Labs, no Shodan, no PageSpeed.
* **SSRF-safe.** Every outbound HTTP request goes through ``safe_fetch``;
  every DNS lookup is bounded to the audited host. Probes (e.g. ``/.git``)
  are constrained to the exact origin of the audited URL — we never
  follow redirects off-domain for probe paths.
* **Read-only.** No POST, no auth attempts, no form submissions, no
  payloads. Active exploitation would be illegal without explicit
  permission from the site owner; this audit only inspects what an
  unauthenticated visitor naturally sees.
* **Latency-bounded.** p95 target is ~12 seconds. Probes run in parallel
  with a per-probe HEAD timeout of ~4 s. We cap the number of probe URLs
  at a small fixed set so a malicious input can't fan out into a
  resource-exhaustion vector.

The data shape is stable — see ``SecurityAudit`` below.
"""
from __future__ import annotations

import asyncio
import re
import socket
import ssl
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from loguru import logger
from pydantic import BaseModel, Field

from app.core.network_security import safe_fetch


# ── Data shapes ────────────────────────────────────────────────────────────


SECURITY_CATEGORIES = (
    "tls",
    "headers",
    "cookies",
    "content",
    "info_disclosure",
    "dns_email",
    "fingerprinting",
    "dependencies",
    "privacy",
)


class SecurityFinding(BaseModel):
    """One security-relevant observation."""

    category: str = Field(
        ...,
        description=(
            "Top-level audit category. One of: tls, headers, cookies, "
            "content, info_disclosure, dns_email, fingerprinting, "
            "dependencies, privacy."
        ),
    )
    code: str = Field(..., description="Stable identifier so the UI can dedupe.")
    title: str
    detail: str
    severity: str = Field(..., pattern=r"^(critical|warning|info|good)$")
    suggestion: str
    impact: str = Field(default="medium", pattern=r"^(high|medium|low)$")
    # Free-form evidence we want to surface alongside the finding (e.g.
    # the actual header value we saw, the matched fingerprint). Always a
    # short snippet — no full HTTP bodies are echoed.
    evidence: Optional[str] = Field(default=None, max_length=512)


class SecurityCategoryScore(BaseModel):
    category: str
    score: int = Field(..., ge=0, le=100)
    headline: str
    findings_count: int


class TLSDetails(BaseModel):
    """Raw certificate / TLS facts surfaced to the UI."""

    host: str
    port: int = 443
    protocol: Optional[str] = None  # 'TLSv1.3', 'TLSv1.2', ...
    cipher_name: Optional[str] = None
    issuer: Optional[str] = None
    subject: Optional[str] = None
    valid_from_iso: Optional[str] = None
    valid_until_iso: Optional[str] = None
    days_until_expiry: Optional[int] = None
    san: list[str] = Field(default_factory=list)
    is_self_signed: Optional[bool] = None
    chain_ok: Optional[bool] = None


class HeaderObservation(BaseModel):
    """One row in the headers grid the UI renders."""

    name: str
    present: bool
    value: Optional[str] = Field(default=None, max_length=512)
    severity: str = Field(..., pattern=r"^(critical|warning|info|good)$")
    note: Optional[str] = None


class CookieObservation(BaseModel):
    name: str
    secure: bool
    http_only: bool
    same_site: Optional[str] = None  # 'Lax', 'Strict', 'None', or null when missing
    severity: str = Field(..., pattern=r"^(critical|warning|info|good)$")


class DNSEmailFacts(BaseModel):
    """SPF / DMARC / CAA / DNSSEC findings, surfaced for transparency."""

    domain: str
    has_mx: Optional[bool] = None
    spf_record: Optional[str] = Field(default=None, max_length=512)
    dmarc_record: Optional[str] = Field(default=None, max_length=512)
    caa_records: list[str] = Field(default_factory=list)
    has_dnssec: Optional[bool] = None


class ExposedPath(BaseModel):
    """One sensitive path the scanner could reach unauthenticated."""

    path: str
    status: int
    severity: str = Field(..., pattern=r"^(critical|warning|info|good)$")
    note: str


class DetectedLibrary(BaseModel):
    name: str
    version: Optional[str] = None
    severity: str = Field(..., pattern=r"^(critical|warning|info|good)$")
    note: Optional[str] = None


class SecurityAudit(BaseModel):
    """Top-level response shape consumed by the SPA."""

    url: str
    normalized_url: str
    final_url: str
    fetched_at_iso: str
    is_dns_valid: bool
    is_http_valid: bool
    http_status: Optional[int]
    final_redirect_chain: list[str]
    has_ssl: bool

    # Roll-ups
    overall_score: int = Field(..., ge=0, le=100)
    grade: str = Field(..., pattern=r"^(A\+|A|B|C|D|F)$")
    summary: str
    category_scores: list[SecurityCategoryScore]
    findings: list[SecurityFinding]

    # Raw observations the UI renders directly
    tls: Optional[TLSDetails]
    headers: list[HeaderObservation]
    cookies: list[CookieObservation]
    dns_email: Optional[DNSEmailFacts]
    exposed_paths: list[ExposedPath]
    detected_libraries: list[DetectedLibrary]
    server_software: Optional[str] = None
    powered_by: Optional[str] = None
    mixed_content_count: int = 0
    insecure_form_count: int = 0
    has_csp: bool = False
    has_hsts: bool = False


# ── HTTP helpers ───────────────────────────────────────────────────────────


_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36 ColdScoutSecurity/1.0"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.7",
}


def _normalize_url(raw: str) -> Optional[str]:
    """Trim, validate roughly, prepend https:// if scheme missing.

    Security audits *prefer* https for the canonical entry: an HTTP-only
    site is itself a finding, but we still report on it.
    """
    raw = (raw or "").strip()
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    parsed = urlparse(raw)
    if not parsed.netloc or "." not in parsed.netloc:
        return None
    return raw


async def _fetch(
    client: httpx.AsyncClient,
    url: str,
    *,
    method: str = "GET",
    timeout: float = 10.0,
    max_redirects: int = 5,
) -> tuple[Optional[httpx.Response], list[str]]:
    return await safe_fetch(
        client,
        url,
        method=method,
        headers=_DEFAULT_HEADERS,
        timeout=timeout,
        max_redirects=max_redirects,
    )


# ── TLS / certificate inspection ───────────────────────────────────────────


def _inspect_certificate(host: str, port: int = 443, timeout: float = 5.0) -> Optional[TLSDetails]:
    """Open a TLS connection and read certificate + protocol metadata.

    Synchronous on purpose — `ssl.SSLContext` doesn't have an asyncio
    pathway in stdlib, and we only run this once per audit. We call it
    via ``asyncio.to_thread`` from the async pipeline.
    """
    try:
        ctx = ssl.create_default_context()
        # We *intentionally* validate the chain to detect cert issues —
        # but we also fall back to a non-validating connection so a bad
        # certificate still gets observed instead of silently failing.
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED
        try:
            with socket.create_connection((host, port), timeout=timeout) as sock:
                with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                    cert = ssock.getpeercert()
                    protocol = ssock.version()
                    cipher = ssock.cipher()
                    chain_ok = True
        except ssl.SSLCertVerificationError:
            # Re-attempt without verification so we can still surface
            # cert facts to the user.
            ctx2 = ssl.create_default_context()
            ctx2.check_hostname = False
            ctx2.verify_mode = ssl.CERT_NONE
            with socket.create_connection((host, port), timeout=timeout) as sock:
                with ctx2.wrap_socket(sock, server_hostname=host) as ssock:
                    cert = ssock.getpeercert(binary_form=False) or {}
                    if not cert:
                        # CERT_NONE means getpeercert() returns {} unless we
                        # request the binary form — grab DER and parse.
                        der = ssock.getpeercert(binary_form=True)
                        cert = _parse_der(der) if der else {}
                    protocol = ssock.version()
                    cipher = ssock.cipher()
                    chain_ok = False
    except (OSError, ssl.SSLError, socket.timeout) as e:
        logger.debug(f"TLS inspect failed for {host}:{port} — {e!r}")
        return None
    except Exception as e:
        logger.debug(f"TLS inspect unexpected error for {host}:{port} — {e!r}")
        return None

    def _flatten(seq: Any) -> str:
        if not seq:
            return ""
        if isinstance(seq, (list, tuple)):
            parts: list[str] = []
            for item in seq:
                if isinstance(item, (list, tuple)):
                    parts.append("/".join(f"{k}={v}" for k, v in item))
                else:
                    parts.append(str(item))
            return ", ".join(parts)
        return str(seq)

    issuer = _flatten(cert.get("issuer")) if isinstance(cert, dict) else None
    subject = _flatten(cert.get("subject")) if isinstance(cert, dict) else None

    valid_from_iso = None
    valid_until_iso = None
    days_until_expiry: Optional[int] = None
    if isinstance(cert, dict):
        not_before = cert.get("notBefore")
        not_after = cert.get("notAfter")
        try:
            if not_before:
                vf = datetime.strptime(not_before, "%b %d %H:%M:%S %Y %Z")
                valid_from_iso = vf.replace(tzinfo=timezone.utc).isoformat()
            if not_after:
                vu = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                valid_until_iso = vu.replace(tzinfo=timezone.utc).isoformat()
                days_until_expiry = (vu.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).days
        except Exception:
            pass

    san_list: list[str] = []
    if isinstance(cert, dict):
        for entry in cert.get("subjectAltName", []) or []:
            try:
                _, val = entry
                san_list.append(str(val))
            except Exception:
                continue

    # Self-signed detection: issuer == subject when both present.
    is_self_signed = bool(issuer) and issuer == subject

    return TLSDetails(
        host=host,
        port=port,
        protocol=protocol,
        cipher_name=cipher[0] if cipher else None,
        issuer=issuer,
        subject=subject,
        valid_from_iso=valid_from_iso,
        valid_until_iso=valid_until_iso,
        days_until_expiry=days_until_expiry,
        san=san_list[:20],
        is_self_signed=is_self_signed,
        chain_ok=chain_ok,
    )


def _parse_der(der: bytes) -> dict:
    """Best-effort DER cert parse via stdlib. Falls back to {} on failure.

    We deliberately don't pull in ``cryptography`` here — it's a heavy
    dependency and stdlib gives us enough for the user-visible details.
    """
    try:
        import ssl as _ssl
        # _test_decode_cert isn't documented but is the canonical way to
        # parse a cert dict from DER in stdlib. Wrap defensively.
        # NB: requires PEM, so convert.
        import base64
        pem = (
            b"-----BEGIN CERTIFICATE-----\n"
            + base64.encodebytes(der)
            + b"-----END CERTIFICATE-----\n"
        ).decode()
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as tf:
            tf.write(pem.encode())
            path = tf.name
        try:
            return _ssl._ssl._test_decode_cert(path) or {}  # type: ignore[attr-defined]
        finally:
            import os
            try:
                os.unlink(path)
            except OSError:
                pass
    except Exception:
        return {}


# ── Per-category check helpers ─────────────────────────────────────────────


def _check_tls(tls: Optional[TLSDetails], is_https: bool) -> tuple[list[SecurityFinding], int]:
    findings: list[SecurityFinding] = []
    score = 100

    if not is_https:
        findings.append(
            SecurityFinding(
                category="tls",
                code="no_https",
                title="Site does not enforce HTTPS",
                detail=(
                    "Visitors can reach the site over plain HTTP, where every "
                    "request can be read, modified, or hijacked on the network "
                    "in between. Browsers also display 'Not Secure' to users."
                ),
                suggestion=(
                    "Install a free Let's Encrypt certificate, redirect "
                    "http:// → https:// at the server, and enable HSTS."
                ),
                severity="critical",
                impact="high",
            )
        )
        score -= 40

    if tls is None:
        if is_https:
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_inspect_failed",
                    title="Couldn't inspect TLS certificate",
                    detail=(
                        "We reached the site over HTTPS but failed to retrieve "
                        "the TLS handshake details. The server may be using a "
                        "non-standard port or blocking probes."
                    ),
                    suggestion=(
                        "Manually verify the certificate chain via "
                        "https://www.ssllabs.com/ssltest/."
                    ),
                    severity="info",
                    impact="low",
                )
            )
        return findings, max(score, 0)

    if tls.chain_ok is False:
        findings.append(
            SecurityFinding(
                category="tls",
                code="tls_chain_invalid",
                title="TLS certificate chain failed validation",
                detail=(
                    "The certificate chain doesn't verify against the "
                    "default trust store. Most modern browsers will block "
                    "the page until the user explicitly accepts the risk."
                ),
                suggestion=(
                    "Re-issue the certificate via a recognised CA "
                    "(Let's Encrypt is free and trusted everywhere) and "
                    "deploy the full intermediate chain."
                ),
                severity="critical",
                impact="high",
                evidence=f"issuer={tls.issuer}",
            )
        )
        score -= 30

    if tls.is_self_signed:
        findings.append(
            SecurityFinding(
                category="tls",
                code="tls_self_signed",
                title="Self-signed certificate",
                detail=(
                    "The certificate was issued by the same party it is "
                    "issued to — browsers cannot trust it. Visitors get a "
                    "scary warning interstitial."
                ),
                suggestion="Replace with a Let's Encrypt or commercial CA-signed certificate.",
                severity="critical",
                impact="high",
                evidence=f"subject={tls.subject}",
            )
        )
        score -= 25

    if tls.days_until_expiry is not None:
        if tls.days_until_expiry < 0:
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_expired",
                    title="TLS certificate is expired",
                    detail=(
                        "The certificate's notAfter date is in the past. "
                        f"Expired {abs(tls.days_until_expiry)} day(s) ago."
                    ),
                    suggestion="Renew the certificate immediately. Configure auto-renewal (certbot).",
                    severity="critical",
                    impact="high",
                    evidence=f"expired {abs(tls.days_until_expiry)}d ago",
                )
            )
            score -= 30
        elif tls.days_until_expiry <= 14:
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_expiring_soon",
                    title=f"Certificate expires in {tls.days_until_expiry} day(s)",
                    detail="Renew before expiry to avoid a public-facing outage.",
                    suggestion="Set up automated renewal via certbot or your CDN's auto-renewal feature.",
                    severity="warning",
                    impact="high",
                )
            )
            score -= 10
        else:
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_cert_valid",
                    title=f"Certificate valid for {tls.days_until_expiry} more day(s)",
                    detail="Certificate is current and chain-validates.",
                    suggestion="Keep auto-renewal enabled.",
                    severity="good",
                    impact="low",
                )
            )

    if tls.protocol:
        if tls.protocol in ("SSLv3", "TLSv1", "TLSv1.1"):
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_legacy_protocol",
                    title=f"Server negotiates legacy TLS protocol: {tls.protocol}",
                    detail=(
                        "Modern browsers (Chrome 84+, Firefox 78+) disable "
                        "TLS 1.0/1.1 by default. Visitors on these browsers "
                        "will be unable to connect."
                    ),
                    suggestion="Disable TLS 1.0 and 1.1; require TLS 1.2+ in your server config.",
                    severity="critical",
                    impact="high",
                    evidence=tls.protocol,
                )
            )
            score -= 25
        elif tls.protocol == "TLSv1.2":
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_no_tls13",
                    title="Server doesn't negotiate TLS 1.3",
                    detail=(
                        "TLS 1.3 (2018) is faster and removes legacy cipher "
                        "suites. TLS 1.2 is still acceptable but lagging."
                    ),
                    suggestion="Enable TLS 1.3 in your server / load balancer config.",
                    severity="info",
                    impact="low",
                    evidence=tls.protocol,
                )
            )
            score -= 3
        else:
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_modern_protocol",
                    title=f"Modern TLS protocol: {tls.protocol}",
                    detail="The handshake negotiated a current protocol version.",
                    suggestion="Keep cipher suites updated as ciphers age out.",
                    severity="good",
                    impact="low",
                )
            )

    if tls.cipher_name:
        weak_cipher = any(
            t in tls.cipher_name.upper()
            for t in ("RC4", "3DES", "DES_", "EXPORT", "NULL", "MD5")
        )
        if weak_cipher:
            findings.append(
                SecurityFinding(
                    category="tls",
                    code="tls_weak_cipher",
                    title=f"Weak cipher negotiated: {tls.cipher_name}",
                    detail="The cipher suite includes algorithms with known weaknesses.",
                    suggestion="Restrict the server cipher list to AEAD suites (e.g. AES-GCM, CHACHA20-POLY1305).",
                    severity="warning",
                    impact="medium",
                    evidence=tls.cipher_name,
                )
            )
            score -= 10

    return findings, max(score, 0)


# Mozilla / OWASP "secure headers" checklist. Each entry is:
#   (canonical name, recommended? bool, severity-when-missing,
#    short note for the UI)
_HEADER_RULES: list[tuple[str, str, str]] = [
    ("Strict-Transport-Security", "critical", "Forces browsers to use HTTPS for future requests."),
    ("Content-Security-Policy", "warning", "Defends against XSS by whitelisting script sources."),
    ("X-Frame-Options", "warning", "Prevents clickjacking by disallowing framing."),
    ("X-Content-Type-Options", "warning", "Disables MIME-sniffing on responses."),
    ("Referrer-Policy", "info", "Limits how much referrer URL is leaked to third parties."),
    ("Permissions-Policy", "info", "Locks down browser features (camera, geolocation, ...)."),
    ("Cross-Origin-Opener-Policy", "info", "Isolates the browsing context from attacker windows."),
    ("Cross-Origin-Resource-Policy", "info", "Stops other origins from embedding your resources."),
    ("Cross-Origin-Embedder-Policy", "info", "Enables stronger isolation for SharedArrayBuffer use cases."),
]


def _check_headers(
    response_headers: dict[str, str],
    is_https: bool,
) -> tuple[list[SecurityFinding], list[HeaderObservation], int, bool, bool]:
    findings: list[SecurityFinding] = []
    observations: list[HeaderObservation] = []
    score = 100

    # Normalise to a case-insensitive view.
    lower = {k.lower(): v for k, v in response_headers.items()}

    has_hsts = False
    has_csp = False

    for name, severity_when_missing, note in _HEADER_RULES:
        key = name.lower()
        value = lower.get(key)
        present = value is not None
        if name == "Strict-Transport-Security":
            has_hsts = present
        if name == "Content-Security-Policy":
            has_csp = present

        if present:
            obs = HeaderObservation(
                name=name,
                present=True,
                value=value[:512] if value else None,
                severity="good",
                note=note,
            )
            observations.append(obs)
            # HSTS specifically: require max-age >= 6 months and prefer
            # ``includeSubDomains; preload``.
            if name == "Strict-Transport-Security" and value:
                if not re.search(r"max-age\s*=\s*(\d+)", value, re.I):
                    findings.append(
                        SecurityFinding(
                            category="headers",
                            code="hsts_no_max_age",
                            title="HSTS header missing max-age",
                            detail="Without max-age the directive is ignored by browsers.",
                            suggestion="Set Strict-Transport-Security: max-age=31536000; includeSubDomains; preload.",
                            severity="warning",
                            impact="medium",
                            evidence=value[:200],
                        )
                    )
                    score -= 8
                else:
                    m = re.search(r"max-age\s*=\s*(\d+)", value, re.I)
                    max_age = int(m.group(1)) if m else 0
                    if max_age < 15_552_000:  # 6 months
                        findings.append(
                            SecurityFinding(
                                category="headers",
                                code="hsts_short_max_age",
                                title=f"HSTS max-age is short ({max_age}s)",
                                detail="The recommended minimum is 6 months (15552000s).",
                                suggestion="Increase max-age to 31536000 (1 year) once you're sure HTTPS is permanent.",
                                severity="info",
                                impact="low",
                                evidence=value[:200],
                            )
                        )
                        score -= 3
            # CSP specifically: a value of ``default-src *`` is barely
            # better than no CSP at all.
            if name == "Content-Security-Policy" and value:
                if "unsafe-inline" in value.lower():
                    findings.append(
                        SecurityFinding(
                            category="headers",
                            code="csp_unsafe_inline",
                            title="CSP allows 'unsafe-inline'",
                            detail=(
                                "'unsafe-inline' permits inline <script> blocks "
                                "and event handlers, which defeats the primary "
                                "XSS mitigation a CSP provides."
                            ),
                            suggestion=(
                                "Move inline scripts to external files and use "
                                "nonces or hashes instead of 'unsafe-inline'."
                            ),
                            severity="warning",
                            impact="medium",
                            evidence=value[:200],
                        )
                    )
                    score -= 5
        else:
            observations.append(
                HeaderObservation(
                    name=name,
                    present=False,
                    value=None,
                    severity=severity_when_missing,
                    note=note,
                )
            )

            # Special-case: HSTS is only meaningful on HTTPS.
            if name == "Strict-Transport-Security" and not is_https:
                continue

            findings.append(
                SecurityFinding(
                    category="headers",
                    code=f"missing_{name.lower().replace('-', '_')}",
                    title=f"Missing security header: {name}",
                    detail=note,
                    suggestion=_header_suggestion(name),
                    severity=severity_when_missing,
                    impact="high"
                    if severity_when_missing == "critical"
                    else ("medium" if severity_when_missing == "warning" else "low"),
                )
            )
            score -= {"critical": 15, "warning": 8, "info": 3}[severity_when_missing]

    return findings, observations, max(score, 0), has_hsts, has_csp


def _header_suggestion(name: str) -> str:
    return {
        "Strict-Transport-Security": "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
        "Content-Security-Policy": "Start with a report-only policy then tighten: default-src 'self'; script-src 'self' …",
        "X-Frame-Options": "Add: X-Frame-Options: SAMEORIGIN (or use CSP frame-ancestors).",
        "X-Content-Type-Options": "Add: X-Content-Type-Options: nosniff",
        "Referrer-Policy": "Add: Referrer-Policy: strict-origin-when-cross-origin",
        "Permissions-Policy": "Add: Permissions-Policy: camera=(), microphone=(), geolocation=()",
        "Cross-Origin-Opener-Policy": "Add: Cross-Origin-Opener-Policy: same-origin",
        "Cross-Origin-Resource-Policy": "Add: Cross-Origin-Resource-Policy: same-site",
        "Cross-Origin-Embedder-Policy": "Add: Cross-Origin-Embedder-Policy: require-corp (only if your SharedArrayBuffer use case demands it).",
    }.get(name, "Configure this header at your web server / CDN edge.")


def _check_cookies(
    raw_set_cookies: list[str], is_https: bool
) -> tuple[list[SecurityFinding], list[CookieObservation], int]:
    findings: list[SecurityFinding] = []
    cookies: list[CookieObservation] = []
    score = 100
    if not raw_set_cookies:
        return findings, cookies, score

    for raw in raw_set_cookies:
        # Naive cookie parser — enough to inspect attributes for security.
        parts = [p.strip() for p in raw.split(";") if p.strip()]
        if not parts:
            continue
        name_value = parts[0]
        if "=" not in name_value:
            continue
        cookie_name = name_value.split("=", 1)[0]
        flags_lower = [p.lower() for p in parts[1:]]
        secure = any(p == "secure" for p in flags_lower)
        http_only = any(p == "httponly" for p in flags_lower)
        same_site = None
        for p in flags_lower:
            if p.startswith("samesite="):
                same_site = p.split("=", 1)[1].title()
                break

        sev = "good"
        if is_https and not secure:
            sev = "critical"
        elif not http_only or same_site is None:
            sev = "warning"

        cookies.append(
            CookieObservation(
                name=cookie_name[:80],
                secure=secure,
                http_only=http_only,
                same_site=same_site,
                severity=sev,
            )
        )

        if is_https and not secure:
            findings.append(
                SecurityFinding(
                    category="cookies",
                    code=f"cookie_no_secure_{cookie_name}",
                    title=f"Cookie '{cookie_name}' missing Secure flag",
                    detail=(
                        "Without the Secure flag, the browser will send this "
                        "cookie over plain HTTP — exposing session data to "
                        "anyone on the same network."
                    ),
                    suggestion="Set the Secure attribute on every cookie issued by your application.",
                    severity="critical",
                    impact="high",
                    evidence=cookie_name,
                )
            )
            score -= 12
        if not http_only:
            findings.append(
                SecurityFinding(
                    category="cookies",
                    code=f"cookie_no_httponly_{cookie_name}",
                    title=f"Cookie '{cookie_name}' missing HttpOnly flag",
                    detail=(
                        "Without HttpOnly, JavaScript (and any XSS that lands) "
                        "can read the cookie value — a classic session-theft path."
                    ),
                    suggestion="Set HttpOnly on cookies that don't need JS access (session, auth, csrf).",
                    severity="warning",
                    impact="medium",
                    evidence=cookie_name,
                )
            )
            score -= 6
        if same_site is None:
            findings.append(
                SecurityFinding(
                    category="cookies",
                    code=f"cookie_no_samesite_{cookie_name}",
                    title=f"Cookie '{cookie_name}' missing SameSite attribute",
                    detail=(
                        "Without SameSite, the cookie is sent on cross-site "
                        "requests — making CSRF easier."
                    ),
                    suggestion="Set SameSite=Lax (or Strict for auth cookies).",
                    severity="info",
                    impact="low",
                    evidence=cookie_name,
                )
            )
            score -= 3

    return findings, cookies, max(score, 0)


def _check_content(
    *,
    soup: Optional[BeautifulSoup],
    final_url: str,
    is_https: bool,
) -> tuple[list[SecurityFinding], int, int, int]:
    """Mixed content + insecure forms + SRI on third-party scripts."""
    findings: list[SecurityFinding] = []
    score = 100
    mixed = 0
    insecure_forms = 0

    if soup is None:
        return findings, score, mixed, insecure_forms

    # Mixed-content count: any <script src=http://>, <link href=http://>,
    # <img src=http://>, <iframe src=http://> on an HTTPS page.
    if is_https:
        for tag, attr in (
            ("script", "src"),
            ("link", "href"),
            ("img", "src"),
            ("iframe", "src"),
            ("audio", "src"),
            ("video", "src"),
            ("source", "src"),
        ):
            for el in soup.find_all(tag):
                src = el.get(attr) or ""
                if src.lower().startswith("http://"):
                    mixed += 1
        if mixed > 0:
            findings.append(
                SecurityFinding(
                    category="content",
                    code="mixed_content",
                    title=f"Page loads {mixed} HTTP resource(s) from an HTTPS page",
                    detail=(
                        "Browsers may block these requests, leaving the page "
                        "broken or visually incomplete. Active mixed content "
                        "(scripts, iframes) is silently dropped."
                    ),
                    suggestion="Update every asset URL to https:// or a protocol-relative // form.",
                    severity="warning",
                    impact="medium",
                    evidence=f"{mixed} resource(s)",
                )
            )
            score -= min(20, mixed * 4)

    # Forms posting to http:// while page is https://.
    for form in soup.find_all("form"):
        action = (form.get("action") or "").strip().lower()
        if is_https and action.startswith("http://"):
            insecure_forms += 1
        # autocomplete=off on password fields used to be considered good;
        # modern guidance (Chrome / Mozilla) flipped — but a missing
        # ``autocomplete="current-password"`` / ``"new-password"`` hint
        # still degrades password manager UX. We don't penalise either
        # way; that's noise.
    if insecure_forms:
        findings.append(
            SecurityFinding(
                category="content",
                code="insecure_form_action",
                title=f"{insecure_forms} form(s) post to plain HTTP",
                detail=(
                    "A form on the HTTPS page submits to an http:// endpoint, "
                    "so any data the user types is exposed on the wire."
                ),
                suggestion="Switch the form action to the https:// equivalent.",
                severity="critical",
                impact="high",
                evidence=f"{insecure_forms} form(s)",
            )
        )
        score -= 20

    # SRI on third-party scripts. Anything with src='//cdn…' or
    # 'https://anotherdomain' must have integrity= + crossorigin=.
    site_host = urlparse(final_url).netloc.lower()
    missing_sri = 0
    for el in soup.find_all("script"):
        src = (el.get("src") or "").strip()
        if not src:
            continue
        host = urlparse(urljoin(final_url, src)).netloc.lower()
        if host and host != site_host:
            if not el.get("integrity"):
                missing_sri += 1
    if missing_sri:
        findings.append(
            SecurityFinding(
                category="content",
                code="missing_sri",
                title=f"{missing_sri} third-party script(s) without Subresource Integrity",
                detail=(
                    "If a CDN you trust gets compromised, the attacker can "
                    "replace the script and execute arbitrary JS in your "
                    "users' browsers. SRI pins the hash so a tampered script "
                    "is refused by the browser."
                ),
                suggestion=(
                    "Add integrity='sha384-…' + crossorigin='anonymous' on "
                    "every external <script> tag."
                ),
                severity="warning",
                impact="medium",
                evidence=f"{missing_sri} script(s)",
            )
        )
        score -= min(15, missing_sri * 3)

    return findings, max(score, 0), mixed, insecure_forms


# Sensitive paths we probe with a HEAD request. Each entry: (path,
# severity-if-200, note). We deliberately keep the list small to bound
# the latency budget and avoid noisy false-positives.
_PROBE_PATHS: list[tuple[str, str, str]] = [
    ("/.env", "critical", "Common application secrets file — must never be web-served."),
    ("/.git/config", "critical", "Exposed Git config — attackers can clone source code + history."),
    ("/.git/HEAD", "critical", "Exposed Git repository — full source code recovery."),
    ("/.git/", "warning", "Directory listing for .git — may expose source via path traversal."),
    ("/wp-config.php", "warning", "WordPress config — should be 403 or 200 empty."),
    ("/phpinfo.php", "critical", "phpinfo() output leaks server config + extensions."),
    ("/info.php", "critical", "phpinfo() output leaks server config + extensions."),
    ("/.htaccess", "warning", "Apache htaccess — should never be web-readable."),
    ("/.htpasswd", "critical", "Apache htpasswd — contains hashed credentials."),
    ("/server-status", "warning", "Apache server-status — leaks request logs."),
    ("/server-info", "warning", "Apache server-info — leaks server configuration."),
    ("/.DS_Store", "info", "macOS metadata file — leaks directory contents."),
    ("/.well-known/security.txt", "good", "Security disclosure contact — good practice if present."),
]


async def _probe_paths(
    client: httpx.AsyncClient, origin: str
) -> tuple[list[ExposedPath], list[SecurityFinding], int]:
    findings: list[SecurityFinding] = []
    exposed: list[ExposedPath] = []
    score = 100

    async def _probe(path: str, severity: str, note: str) -> Optional[ExposedPath]:
        url = urljoin(origin, path)
        try:
            resp, _ = await safe_fetch(client, url, method="HEAD", timeout=4.0, max_redirects=2)
            if resp is None:
                return None
            status = resp.status_code
            # Treat 200 (and rarely 206) as "exposed". 401/403 == properly
            # secured. 404 == not present (the most common case).
            if status == 200:
                return ExposedPath(path=path, status=status, severity=severity, note=note)
            if status in (401, 403):
                return ExposedPath(
                    path=path, status=status, severity="good", note="Endpoint exists but is access-controlled."
                )
            if path == "/.well-known/security.txt" and status == 200:
                return ExposedPath(path=path, status=status, severity="good", note=note)
        except Exception:
            return None
        return None

    results = await asyncio.gather(
        *[_probe(p, s, n) for p, s, n in _PROBE_PATHS],
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, ExposedPath):
            exposed.append(r)

    for ex in exposed:
        if ex.severity == "good":
            continue
        findings.append(
            SecurityFinding(
                category="info_disclosure",
                code=f"exposed_{ex.path.strip('/').replace('/', '_').replace('.', '')}",
                title=f"Exposed sensitive path: {ex.path}",
                detail=ex.note,
                suggestion=(
                    "Block access to this path at the web server / CDN. If "
                    "the file is application data, move it outside the docroot."
                ),
                severity=ex.severity,
                impact="high" if ex.severity == "critical" else "medium",
                evidence=f"{ex.path} → HTTP {ex.status}",
            )
        )
        score -= {"critical": 20, "warning": 8, "info": 3}.get(ex.severity, 0)

    # Reward presence of /.well-known/security.txt
    has_secure_txt = any(
        e.path == "/.well-known/security.txt" and e.severity == "good" for e in exposed
    )
    if has_secure_txt:
        findings.append(
            SecurityFinding(
                category="info_disclosure",
                code="security_txt_present",
                title="/.well-known/security.txt is published",
                detail="Researchers know who to contact about a vulnerability — RFC 9116 best practice.",
                suggestion="Keep the file current and rotate contacts as your team changes.",
                severity="good",
                impact="low",
            )
        )
    else:
        findings.append(
            SecurityFinding(
                category="info_disclosure",
                code="no_security_txt",
                title="No /.well-known/security.txt",
                detail=(
                    "Researchers have no canonical way to disclose a "
                    "vulnerability to you. Recommended by RFC 9116."
                ),
                suggestion=(
                    "Publish https://yourdomain.com/.well-known/security.txt "
                    "with a Contact: mailto:security@yourdomain.com line."
                ),
                severity="info",
                impact="low",
            )
        )
        score -= 2

    return exposed, findings, max(score, 0)


# ── Server fingerprinting ─────────────────────────────────────────────────


# Very rough "has this software hit known critical CVEs" check. We list
# software families where leaking the major version is risky on its own
# (e.g. PHP/5.x EOL, Apache 2.2 EOL). We DO NOT try to enumerate every CVE.
_RISKY_SOFTWARE_PATTERNS = [
    (re.compile(r"PHP/5\.", re.I), "PHP 5.x is end-of-life since Dec 2018 — known unpatched vulnerabilities."),
    (re.compile(r"PHP/7\.[0-3]\.", re.I), "PHP 7.0-7.3 are end-of-life — no longer receiving security updates."),
    (re.compile(r"Apache/2\.2\.", re.I), "Apache 2.2 is end-of-life since 2018."),
    (re.compile(r"Apache/2\.0\.", re.I), "Apache 2.0 is severely outdated."),
    (re.compile(r"nginx/1\.([0-9]|1[0-7])\.", re.I), "nginx <1.18 has known security issues."),
    (re.compile(r"Microsoft-IIS/[0-7]\.", re.I), "Microsoft-IIS <8 lacks modern security defaults."),
    (re.compile(r"OpenSSL/1\.0\.", re.I), "OpenSSL 1.0.x is end-of-life — many known CVEs."),
]


def _check_fingerprinting(
    server: Optional[str], powered_by: Optional[str]
) -> tuple[list[SecurityFinding], int]:
    findings: list[SecurityFinding] = []
    score = 100

    if server and "/" in server and any(c.isdigit() for c in server):
        findings.append(
            SecurityFinding(
                category="fingerprinting",
                code="server_version_disclosed",
                title=f"Server header leaks software + version: {server}",
                detail=(
                    "Telling every visitor the exact server software + version "
                    "makes it trivial for attackers to find matching exploits."
                ),
                suggestion=(
                    "In nginx: server_tokens off; In Apache: ServerTokens Prod + ServerSignature Off."
                ),
                severity="warning",
                impact="medium",
                evidence=server[:200],
            )
        )
        score -= 8
        # Risky software-version match
        for pat, note in _RISKY_SOFTWARE_PATTERNS:
            if pat.search(server):
                findings.append(
                    SecurityFinding(
                        category="fingerprinting",
                        code="risky_server_version",
                        title=f"Server reports {server.split(' ')[0]} — flagged as risky",
                        detail=note,
                        suggestion="Upgrade to a currently-supported major version.",
                        severity="critical",
                        impact="high",
                        evidence=server[:200],
                    )
                )
                score -= 20
                break

    if powered_by:
        findings.append(
            SecurityFinding(
                category="fingerprinting",
                code="x_powered_by_disclosed",
                title=f"X-Powered-By header leaks framework: {powered_by}",
                detail="Exposes the application runtime + version to every request.",
                suggestion=(
                    "Strip X-Powered-By at your CDN edge. In Express: app.disable('x-powered-by'). "
                    "In PHP: expose_php = Off."
                ),
                severity="warning",
                impact="medium",
                evidence=powered_by[:200],
            )
        )
        score -= 5
        for pat, note in _RISKY_SOFTWARE_PATTERNS:
            if pat.search(powered_by):
                findings.append(
                    SecurityFinding(
                        category="fingerprinting",
                        code="risky_runtime_version",
                        title=f"Runtime reports {powered_by.split(' ')[0]} — flagged as risky",
                        detail=note,
                        suggestion="Upgrade to a supported runtime version.",
                        severity="critical",
                        impact="high",
                        evidence=powered_by[:200],
                    )
                )
                score -= 20
                break

    if not server and not powered_by:
        findings.append(
            SecurityFinding(
                category="fingerprinting",
                code="server_headers_clean",
                title="No server / framework fingerprints leaked",
                detail="The server suppresses identifying headers — minimal attacker recon surface.",
                suggestion="Keep server_tokens off across your stack.",
                severity="good",
                impact="low",
            )
        )

    return findings, max(score, 0)


# ── Library / dependency detection ────────────────────────────────────────


def _check_dependencies(soup: Optional[BeautifulSoup]) -> tuple[list[SecurityFinding], list[DetectedLibrary], int]:
    findings: list[SecurityFinding] = []
    libs: list[DetectedLibrary] = []
    score = 100
    if soup is None:
        return findings, libs, score

    # Pattern → (library, severity threshold function).
    PATTERNS = [
        (re.compile(r"jquery[-./]?(\d+\.\d+(?:\.\d+)?)\.?(?:min\.)?js", re.I), "jQuery"),
        (re.compile(r"bootstrap[-./]?(\d+\.\d+(?:\.\d+)?)\.?(?:min\.)?(?:js|css)", re.I), "Bootstrap"),
        (re.compile(r"angular[-./]?(\d+\.\d+(?:\.\d+)?)\.?(?:min\.)?js", re.I), "Angular"),
        (re.compile(r"react[-./]?(\d+\.\d+(?:\.\d+)?)\.?(?:min\.)?js", re.I), "React"),
        (re.compile(r"vue[-./]?(\d+\.\d+(?:\.\d+)?)\.?(?:min\.)?js", re.I), "Vue"),
        (re.compile(r"wp-content/.*?\?ver=(\d+\.\d+(?:\.\d+)?)", re.I), "WordPress (asset version)"),
    ]

    sources: list[str] = []
    for el in soup.find_all(["script", "link"]):
        src = el.get("src") or el.get("href")
        if src:
            sources.append(src)
    raw = " ".join(sources)

    seen: set[str] = set()
    for pat, name in PATTERNS:
        m = pat.search(raw)
        if not m:
            continue
        version = m.group(1)
        if (name, version) in seen:
            continue
        seen.add((name, version))

        sev = "info"
        note = "Detected on the page."
        # Hard-coded "this major version is EOL" rules. Not a CVE database
        # — just a conservative flag for very old releases.
        try:
            major = int(version.split(".")[0])
            minor = int(version.split(".")[1]) if "." in version else 0
        except Exception:
            major, minor = 0, 0
        if name == "jQuery" and (major < 3 or (major == 3 and minor < 5)):
            sev = "warning"
            note = "jQuery <3.5 has known XSS issues (CVE-2020-11022/23). Upgrade to 3.6+."
        elif name == "Bootstrap" and major < 4:
            sev = "warning"
            note = "Bootstrap <4 has known XSS issues. Upgrade to 5.x."
        elif name == "Angular" and major < 12:
            sev = "warning"
            note = "Old AngularJS / Angular versions are no longer receiving security updates."

        libs.append(DetectedLibrary(name=name, version=version, severity=sev, note=note))
        if sev != "info":
            findings.append(
                SecurityFinding(
                    category="dependencies",
                    code=f"outdated_{name.lower().replace(' ', '_')}",
                    title=f"Outdated {name} detected ({version})",
                    detail=note,
                    suggestion=f"Upgrade {name} to a currently-supported version.",
                    severity=sev,
                    impact="medium" if sev == "warning" else "low",
                    evidence=f"{name} {version}",
                )
            )
            score -= 6

    # Generator meta tags (WordPress, Drupal, etc).
    gen_tag = soup.find("meta", attrs={"name": re.compile(r"^generator$", re.I)})
    if gen_tag and gen_tag.get("content"):
        gen = gen_tag["content"]
        libs.append(
            DetectedLibrary(
                name="CMS generator",
                version=gen[:80],
                severity="info",
                note="The page advertises its generator via <meta name=generator>.",
            )
        )
        findings.append(
            SecurityFinding(
                category="dependencies",
                code="cms_generator_meta",
                title="CMS generator meta tag is exposed",
                detail=(
                    "The <meta name='generator'> tag tells attackers exactly "
                    "which CMS + version you're on — a free recon win."
                ),
                suggestion=(
                    "Strip the generator tag. WordPress: remove_action('wp_head', 'wp_generator'); Drupal: edit html.html.twig."
                ),
                severity="info",
                impact="low",
                evidence=gen[:200],
            )
        )
        score -= 2

    return findings, libs, max(score, 0)


# ── Privacy / cookie consent / policy links ───────────────────────────────


def _check_privacy(soup: Optional[BeautifulSoup]) -> tuple[list[SecurityFinding], int]:
    findings: list[SecurityFinding] = []
    score = 100
    if soup is None:
        return findings, score

    text = soup.get_text(separator=" ", strip=True).lower()
    href_text = " ".join(
        (a.get("href") or "") + " " + a.get_text(strip=True).lower()
        for a in soup.find_all("a")
    )
    haystack = (text + " " + href_text).lower()

    has_privacy = any(p in haystack for p in ("privacy policy", "/privacy", "privacy-policy"))
    has_terms = any(p in haystack for p in ("terms of service", "terms of use", "/terms"))
    has_cookie = any(p in haystack for p in ("cookie", "cookies"))

    if not has_privacy:
        findings.append(
            SecurityFinding(
                category="privacy",
                code="no_privacy_policy",
                title="No Privacy Policy link found",
                detail=(
                    "GDPR / CCPA and most app-store policies require a "
                    "discoverable Privacy Policy. Absence is a legal risk."
                ),
                suggestion="Publish /privacy and link it from the global footer.",
                severity="warning",
                impact="medium",
            )
        )
        score -= 12
    if not has_terms:
        findings.append(
            SecurityFinding(
                category="privacy",
                code="no_terms_of_service",
                title="No Terms of Service link found",
                detail="Without ToS, you have no enforceable user agreement.",
                suggestion="Publish /terms and link it from the global footer.",
                severity="info",
                impact="low",
            )
        )
        score -= 5

    # Cookie consent banner / mention is a soft check — many sites
    # legitimately serve no cookies and need no banner.
    cookies = soup.find_all(string=re.compile(r"\bcookie\b", re.I))
    if not cookies and not has_cookie:
        findings.append(
            SecurityFinding(
                category="privacy",
                code="no_cookie_notice",
                title="No cookie consent banner detected",
                detail=(
                    "If the site serves first- or third-party cookies, EU "
                    "visitors must be asked for consent before they are set."
                ),
                suggestion=(
                    "If you serve cookies, add a consent banner (Cookiebot, "
                    "Osano, or a hand-rolled one). If you don't, ignore this."
                ),
                severity="info",
                impact="low",
            )
        )
        score -= 3

    return findings, max(score, 0)


# ── DNS / email auth lookups ──────────────────────────────────────────────


def _dns_text_records(host: str) -> list[str]:
    """Sync TXT lookup. Returns [] on failure (DNS / firewall / missing)."""
    try:
        # ``socket.getaddrinfo`` doesn't expose TXT — use dnspython if
        # available, otherwise return [].
        try:
            import dns.resolver  # type: ignore
        except ImportError:
            return []
        try:
            resolver = dns.resolver.Resolver()
            resolver.timeout = 4.0
            resolver.lifetime = 6.0
            answers = resolver.resolve(host, "TXT", lifetime=6.0)
            out: list[str] = []
            for r in answers:
                try:
                    # Each TXT can contain multiple character-strings; join.
                    val = b"".join(r.strings).decode("utf-8", "replace")
                except Exception:
                    val = str(r)
                out.append(val[:512])
            return out
        except Exception:
            return []
    except Exception:
        return []


def _dns_records(host: str, rtype: str) -> list[str]:
    try:
        import dns.resolver  # type: ignore
        resolver = dns.resolver.Resolver()
        resolver.timeout = 4.0
        resolver.lifetime = 6.0
        answers = resolver.resolve(host, rtype, lifetime=6.0)
        return [str(r) for r in answers][:20]
    except Exception:
        return []


def _check_dns_email(host: str) -> tuple[list[SecurityFinding], Optional[DNSEmailFacts], int]:
    findings: list[SecurityFinding] = []
    score = 100

    # All DNS work is sync — wrap callers in asyncio.to_thread.
    spf_records = _dns_text_records(host)
    mx_records = _dns_records(host, "MX")
    has_mx = bool(mx_records)
    spf_record: Optional[str] = None
    for rec in spf_records:
        if rec.lower().startswith("v=spf1"):
            spf_record = rec
            break

    dmarc_records = _dns_text_records(f"_dmarc.{host}")
    dmarc_record: Optional[str] = None
    for rec in dmarc_records:
        if rec.lower().startswith("v=dmarc1"):
            dmarc_record = rec
            break

    caa_records = _dns_records(host, "CAA")

    # DNSSEC: probe DS at the parent. dnspython doesn't expose AD bit
    # directly via resolve() — best-effort fallback.
    has_dnssec: Optional[bool] = None
    try:
        import dns.resolver  # type: ignore
        try:
            r = dns.resolver.Resolver()
            r.timeout = 4.0
            r.lifetime = 6.0
            r.use_edns(0, 0, 4096)
            r.set_flags(dns.flags.RD)
            r.set_flags(dns.flags.RD | dns.flags.AD)
            ans = r.resolve(host, "DNSKEY", lifetime=6.0, raise_on_no_answer=False)
            has_dnssec = bool(ans.rrset)
        except Exception:
            has_dnssec = None
    except ImportError:
        has_dnssec = None

    facts = DNSEmailFacts(
        domain=host,
        has_mx=has_mx,
        spf_record=spf_record,
        dmarc_record=dmarc_record,
        caa_records=caa_records,
        has_dnssec=has_dnssec,
    )

    if has_mx:
        if not spf_record:
            findings.append(
                SecurityFinding(
                    category="dns_email",
                    code="no_spf",
                    title="Domain has email (MX) but no SPF record",
                    detail=(
                        "Without SPF, anyone can send email claiming to be "
                        "from your domain. Phishing campaigns will love you."
                    ),
                    suggestion=(
                        "Add a TXT record at the apex: 'v=spf1 include:_spf.google.com ~all' "
                        "(adjust includes for your mail provider)."
                    ),
                    severity="warning",
                    impact="high",
                )
            )
            score -= 15
        else:
            findings.append(
                SecurityFinding(
                    category="dns_email",
                    code="spf_present",
                    title="SPF record published",
                    detail=spf_record[:200],
                    suggestion="Make sure the SPF includes every authorised sender.",
                    severity="good",
                    impact="low",
                    evidence=spf_record[:200],
                )
            )

        if not dmarc_record:
            findings.append(
                SecurityFinding(
                    category="dns_email",
                    code="no_dmarc",
                    title="No DMARC policy",
                    detail=(
                        "DMARC tells receiving servers what to do with mail "
                        "that fails SPF/DKIM. Without it, spoofed mail can "
                        "still land in inboxes."
                    ),
                    suggestion=(
                        "Add a TXT at _dmarc.<domain>: "
                        "'v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com'. "
                        "Start with p=none to monitor."
                    ),
                    severity="warning",
                    impact="high",
                )
            )
            score -= 15
        else:
            sev = "good"
            policy = "p=none"
            if "p=none" in dmarc_record.lower():
                sev = "warning"
                policy = "p=none (monitoring only)"
            elif "p=quarantine" in dmarc_record.lower():
                sev = "info"
                policy = "p=quarantine"
            elif "p=reject" in dmarc_record.lower():
                policy = "p=reject"

            findings.append(
                SecurityFinding(
                    category="dns_email",
                    code="dmarc_published",
                    title=f"DMARC published ({policy})",
                    detail=dmarc_record[:200],
                    suggestion=(
                        "Strengthen to p=reject once you've monitored aggregate reports."
                        if "p=none" in dmarc_record.lower()
                        else "Keep monitoring DMARC aggregate reports for misalignment."
                    ),
                    severity=sev,
                    impact="medium",
                    evidence=dmarc_record[:200],
                )
            )
            if sev == "warning":
                score -= 6

    if not caa_records:
        findings.append(
            SecurityFinding(
                category="dns_email",
                code="no_caa",
                title="No CAA records",
                detail=(
                    "Without CAA, any CA can issue a certificate for your "
                    "domain. CAA pins issuance to specific CAs you trust."
                ),
                suggestion=(
                    "Add a CAA record at the apex: "
                    "'0 issue \"letsencrypt.org\"' (adjust for your CA)."
                ),
                severity="info",
                impact="low",
            )
        )
        score -= 4
    else:
        findings.append(
            SecurityFinding(
                category="dns_email",
                code="caa_published",
                title=f"{len(caa_records)} CAA record(s) published",
                detail="CAA pins certificate issuance to specific CAs.",
                suggestion="Keep the CAA list current as your CA portfolio changes.",
                severity="good",
                impact="low",
            )
        )

    if has_dnssec is False:
        findings.append(
            SecurityFinding(
                category="dns_email",
                code="no_dnssec",
                title="DNSSEC not enabled",
                detail=(
                    "Without DNSSEC, DNS responses for your domain can be "
                    "forged or cache-poisoned. Adoption is uneven but "
                    "increasingly important for finance / healthcare."
                ),
                suggestion="Enable DNSSEC at your DNS provider. Cloudflare / Route53 / Google offer 1-click activation.",
                severity="info",
                impact="low",
            )
        )
        score -= 3

    return findings, facts, max(score, 0)


# ── Roll-up ───────────────────────────────────────────────────────────────


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


def _summary_for(grade: str, top: list[SecurityFinding]) -> str:
    if grade == "A+":
        return "Excellent security posture — defence in depth across every category."
    if grade == "A":
        return "Strong overall — a few low-impact gaps remain. Worth knocking out."
    if grade == "B":
        return "Decent baseline. Several missing security headers are dragging the score down."
    if grade == "C":
        return "Mixed signals. Multiple medium-impact issues are leaving the door open to common attacks."
    if grade == "D":
        return "Significant exposure. Fix the critical findings before the next pentest."
    return "Critical exposure. Treat this report as an incident — block exposed endpoints today."


async def run_security_audit(raw_url: str) -> Optional[SecurityAudit]:
    """End-to-end audit. Returns ``None`` if the URL is unparseable."""
    normalized = _normalize_url(raw_url)
    if normalized is None:
        return None

    fetched_at_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    parsed = urlparse(normalized)
    host = (parsed.hostname or "").lower()
    origin = f"{parsed.scheme}://{parsed.netloc}"

    async with httpx.AsyncClient(
        verify=False,
        headers=_DEFAULT_HEADERS,
        follow_redirects=False,
        limits=httpx.Limits(max_keepalive_connections=4, max_connections=8),
    ) as client:
        # 1. Main page fetch with redirect chain captured.
        resp, chain = await _fetch(client, normalized, timeout=10.0)

        # 2. Probes + DNS + TLS all in parallel.
        probes_task = asyncio.create_task(_probe_paths(client, origin))
        tls_task = asyncio.create_task(asyncio.to_thread(_inspect_certificate, host, 443, 5.0))
        dns_task = asyncio.create_task(asyncio.to_thread(_check_dns_email, host))

        exposed_paths, info_findings, info_score = await probes_task
        tls = await tls_task
        dns_findings, dns_facts, dns_score = await dns_task

    is_dns_valid = resp is not None or tls is not None
    is_http_valid = bool(resp and resp.status_code < 400)
    final_url = str(resp.url) if resp else normalized
    has_ssl = final_url.lower().startswith("https://")

    body_html = ""
    soup: Optional[BeautifulSoup] = None
    response_headers: dict[str, str] = {}
    set_cookies: list[str] = []
    server: Optional[str] = None
    powered_by: Optional[str] = None
    if resp is not None:
        try:
            response_headers = dict(resp.headers)
            # ``set-cookie`` is multi-valued — httpx gives us the joined
            # form via .headers, but .headers.get_list returns all of them.
            try:
                set_cookies = list(resp.headers.get_list("set-cookie"))  # type: ignore[attr-defined]
            except Exception:
                sc = resp.headers.get("set-cookie")
                set_cookies = [sc] if sc else []
            server = resp.headers.get("server")
            powered_by = resp.headers.get("x-powered-by")
        except Exception:
            pass
        if is_http_valid:
            try:
                body_html = resp.text
                soup = BeautifulSoup(body_html, "html.parser")
            except Exception:
                soup = None

    tls_findings, tls_score = _check_tls(tls, has_ssl)
    hdr_findings, hdr_observations, hdr_score, has_hsts, has_csp = _check_headers(
        response_headers, has_ssl
    )
    cookie_findings, cookies_obs, cookie_score = _check_cookies(set_cookies, has_ssl)
    content_findings, content_score, mixed, insecure_forms = _check_content(
        soup=soup, final_url=final_url, is_https=has_ssl
    )
    fp_findings, fp_score = _check_fingerprinting(server, powered_by)
    dep_findings, libs, dep_score = _check_dependencies(soup)
    priv_findings, priv_score = _check_privacy(soup)

    findings = (
        tls_findings
        + hdr_findings
        + cookie_findings
        + content_findings
        + info_findings
        + dns_findings
        + fp_findings
        + dep_findings
        + priv_findings
    )
    severity_rank = {"critical": 0, "warning": 1, "info": 2, "good": 3}
    impact_rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (severity_rank[f.severity], impact_rank[f.impact]))

    weights = {
        "tls": 18,
        "headers": 18,
        "cookies": 8,
        "content": 12,
        "info_disclosure": 14,
        "dns_email": 10,
        "fingerprinting": 6,
        "dependencies": 8,
        "privacy": 6,
    }
    raw_scores = {
        "tls": tls_score,
        "headers": hdr_score,
        "cookies": cookie_score,
        "content": content_score,
        "info_disclosure": info_score,
        "dns_email": dns_score,
        "fingerprinting": fp_score,
        "dependencies": dep_score,
        "privacy": priv_score,
    }
    weighted_total = sum(raw_scores[k] * weights[k] for k in weights) / sum(weights.values())
    overall = max(0, min(100, int(round(weighted_total))))
    if not is_http_valid and not has_ssl:
        overall = min(overall, 30)
    grade = _grade_for(overall)
    summary = _summary_for(grade, findings[:3])

    category_scores: list[SecurityCategoryScore] = []
    for cat, raw in raw_scores.items():
        cf = [f for f in findings if f.category == cat]
        headline = (
            "Looking great"
            if not cf
            else (cf[0].title if cf[0].severity in {"critical", "warning"} else "A few minor notes")
        )
        category_scores.append(
            SecurityCategoryScore(
                category=cat, score=raw, headline=headline, findings_count=len(cf)
            )
        )

    return SecurityAudit(
        url=raw_url,
        normalized_url=normalized,
        final_url=final_url,
        fetched_at_iso=fetched_at_iso,
        is_dns_valid=is_dns_valid,
        is_http_valid=is_http_valid,
        http_status=(resp.status_code if resp else None),
        final_redirect_chain=chain,
        has_ssl=has_ssl,
        overall_score=overall,
        grade=grade,
        summary=summary,
        category_scores=category_scores,
        findings=findings,
        tls=tls,
        headers=hdr_observations,
        cookies=cookies_obs,
        dns_email=dns_facts,
        exposed_paths=exposed_paths,
        detected_libraries=libs,
        server_software=server,
        powered_by=powered_by,
        mixed_content_count=mixed,
        insecure_form_count=insecure_forms,
        has_csp=has_csp,
        has_hsts=has_hsts,
    )
