"""
VAPID keypair generator for self-hosted Web Push.

Run once during setup. Copy the printed public + private keys into your
``.env`` (or deployment secret manager) as ``VAPID_PUBLIC_KEY`` and
``VAPID_PRIVATE_KEY``. The frontend reads the public key from
``GET /api/v1/notifications/config`` and hands it to ``PushManager.subscribe``.

Usage::

    cd backend
    python scripts/generate_vapid.py

You only need to do this ONCE per environment. Rotating the keypair forces
every browser / installed PWA to re-subscribe (existing subscriptions silently
stop receiving pushes).
"""
from __future__ import annotations

import base64

try:
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
except ImportError:  # pragma: no cover
    raise SystemExit(
        "cryptography is required: pip install cryptography (already pulled "
        "in as a transitive dep of pywebpush)."
    )


def _b64url(data: bytes) -> str:
    """RFC 7515 base64url, no padding — what the Push API expects."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def main() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())

    raw_priv = private_key.private_numbers().private_value.to_bytes(32, "big")
    priv_b64 = _b64url(raw_priv)

    public_key = private_key.public_key()
    raw_pub = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    pub_b64 = _b64url(raw_pub)

    print()
    print("Generated VAPID keypair (paste into your .env or secret manager):")
    print()
    print(f"VAPID_PUBLIC_KEY={pub_b64}")
    print(f"VAPID_PRIVATE_KEY={priv_b64}")
    print()
    print("Optional but recommended:")
    print('VAPID_SUBJECT="mailto:admin@coldscout.colddsam.com"')
    print()


if __name__ == "__main__":
    main()
