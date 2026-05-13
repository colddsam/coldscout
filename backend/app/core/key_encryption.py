"""
Symmetric encryption for stored API credentials.

The orchestrator persists provider credentials inside ``api_providers``.
At-rest encryption is implemented via Fernet (AES-128-CBC + HMAC-SHA256
under the hood). Two modes are supported, picked automatically:

1. **MultiFernet with explicit keys** — when ``ENCRYPTION_KEY`` is set in
   the environment as a comma-separated list of urlsafe-base64 Fernet keys.
   The first key encrypts new values; every key in the list can decrypt
   existing ciphertexts. To rotate, prepend a new key and run the re-encrypt
   CLI (`python -m app.scripts.rotate_encryption_key`) at your convenience —
   no downtime, no orphaned rows.

2. **APP_SECRET_KEY-derived key** (legacy fallback) — when ``ENCRYPTION_KEY``
   is empty, a key is deterministically derived from ``APP_SECRET_KEY`` via
   SHA-256. This keeps older deployments working without an env-var change,
   but rotating APP_SECRET_KEY in this mode silently breaks every stored
   credential. The startup banner logs a warning when this mode is active.

Why not store plaintext?
  - Database backups, logs, and Supabase row-level read access are still
    possible attack surfaces. Encrypting at rest narrows the blast radius
    of a leaked snapshot or rogue DB read.
"""

from __future__ import annotations

import base64
import hashlib
import re
from functools import lru_cache

from cryptography.fernet import Fernet, MultiFernet, InvalidToken
from loguru import logger

from app.config import get_settings


_FERNET_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{43}=$")


def _derive_from_app_secret(secret: str) -> bytes:
    """Legacy derivation: SHA-256 of APP_SECRET_KEY → urlsafe-b64 Fernet key."""
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _parse_encryption_keys(raw: str) -> list[bytes]:
    """Split + validate a comma-separated list of Fernet keys.

    Each key must already be a 44-char urlsafe-base64 Fernet key (i.e. what
    ``Fernet.generate_key()`` returns). Malformed entries are rejected so a
    typo in the env var fails loudly at startup instead of silently
    re-encrypting with a "default" key.
    """
    keys: list[bytes] = []
    for part in (raw or "").split(","):
        token = part.strip()
        if not token:
            continue
        if not _FERNET_KEY_RE.match(token):
            raise RuntimeError(
                "Invalid ENCRYPTION_KEY entry — expected a 44-char "
                "urlsafe-base64 Fernet key (use Fernet.generate_key())."
            )
        keys.append(token.encode("utf-8"))
    return keys


@lru_cache(maxsize=1)
def _multifernet() -> MultiFernet:
    """Return the process-wide MultiFernet instance.

    Order of precedence:
      1. ``ENCRYPTION_KEY`` env var — comma-separated Fernet keys.
      2. Derived from ``APP_SECRET_KEY`` (legacy single-key mode).
    """
    settings = get_settings()
    explicit = _parse_encryption_keys(settings.ENCRYPTION_KEY)
    if explicit:
        logger.info(
            "API key encryption: {} explicit key(s) loaded "
            "(rotation supported via MultiFernet).",
            len(explicit),
        )
        return MultiFernet([Fernet(k) for k in explicit])

    secret = settings.APP_SECRET_KEY or ""
    if not secret:
        raise RuntimeError(
            "Neither ENCRYPTION_KEY nor APP_SECRET_KEY is configured — "
            "required for API key encryption."
        )
    logger.warning(
        "API key encryption: falling back to APP_SECRET_KEY-derived key. "
        "Set ENCRYPTION_KEY explicitly to enable rotation."
    )
    return MultiFernet([Fernet(_derive_from_app_secret(secret))])


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt a plaintext API key for storage in ``api_providers``."""
    if plaintext is None:
        raise ValueError("Cannot encrypt None")
    token = _multifernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt a stored API key back to plaintext.

    MultiFernet tries every configured key in order; raises ``InvalidToken``
    only if no key can decrypt the value. The orchestrator catches that
    case and disables the affected row.
    """
    if not ciphertext:
        raise ValueError("Cannot decrypt empty ciphertext")
    return _multifernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")


def rotate_ciphertext(ciphertext: str) -> str:
    """Re-encrypt a ciphertext with the primary key.

    Used by the rotation CLI to migrate rows encrypted with an older key
    to the current one without changing the underlying plaintext.
    """
    if not ciphertext:
        raise ValueError("Cannot rotate empty ciphertext")
    return _multifernet().rotate(ciphertext.encode("utf-8")).decode("utf-8")


def mask_api_key(plaintext: str) -> str:
    """Return a partially-masked preview of a plaintext key for UI display.

    Never echoes the full secret back to operators. ``abcdefghij`` becomes
    ``abcd…ghij`` (first 4 + last 4 chars, joined by an ellipsis). Short
    keys (≤8 chars) are masked entirely as ``********``.
    """
    if not plaintext:
        return ""
    if len(plaintext) <= 8:
        return "*" * 8
    return f"{plaintext[:4]}…{plaintext[-4:]}"


__all__ = [
    "encrypt_api_key",
    "decrypt_api_key",
    "rotate_ciphertext",
    "mask_api_key",
    "InvalidToken",
]
