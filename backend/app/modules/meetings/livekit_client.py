"""
Thin wrapper around the LiveKit server SDK (``livekit-api``).

Responsibilities
----------------
* Mint scoped join JWTs for hosts (room admin) and guests.
* Verify inbound LiveKit webhook signatures.

Design notes
------------
The SDK is **lazy-imported** inside each function so the application boots
even when ``livekit-api`` is absent or LiveKit is unconfigured. Callers
should check :func:`is_configured` first; the API layer turns the
unconfigured case into a clean HTTP 503 rather than a 500.
"""
from __future__ import annotations

import json
from datetime import timedelta
from typing import Any, Optional

from app.config import get_settings


class LiveKitNotConfigured(RuntimeError):
    """Raised when a LiveKit operation is attempted without configuration."""


def is_configured() -> bool:
    """True iff URL + API key + secret are all present in settings."""
    s = get_settings()
    return bool(s.LIVEKIT_URL and s.LIVEKIT_API_KEY and s.LIVEKIT_API_SECRET)


def livekit_url() -> str:
    return get_settings().LIVEKIT_URL or ""


def _require_api():
    """Import the LiveKit SDK lazily, with a clear error if it's missing."""
    try:
        from livekit import api  # type: ignore
    except ImportError as e:  # pragma: no cover - optional dependency
        raise LiveKitNotConfigured(
            "livekit-api is not installed. Add 'livekit-api' to "
            "backend/requirements.txt and reinstall."
        ) from e
    return api


def create_token(
    *,
    room: str,
    identity: str,
    name: str,
    role: str,
    ttl_minutes: int,
    metadata: Optional[dict[str, Any]] = None,
) -> str:
    """Mint a scoped LiveKit join JWT for ``identity`` in ``room``.

    Hosts receive ``room_admin`` (mute/kick control); guests do not. Both
    can publish + subscribe A/V and publish data messages (the latter powers
    the client-side "host present" waiting-room signal).
    """
    if not is_configured():
        raise LiveKitNotConfigured("LiveKit is not configured.")
    api = _require_api()
    s = get_settings()
    is_host = role == "host"

    md = dict(metadata or {})
    md["role"] = role

    grants = api.VideoGrants(
        room_join=True,
        room=room,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
        room_admin=is_host,
    )

    token = (
        api.AccessToken(s.LIVEKIT_API_KEY, s.LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(name or identity)
        .with_metadata(json.dumps(md))
        .with_ttl(timedelta(minutes=max(5, int(ttl_minutes))))
        .with_grants(grants)
    )
    return token.to_jwt()


def verify_webhook(body: str, auth_header: Optional[str]):
    """Verify a LiveKit webhook request and return the parsed ``WebhookEvent``.

    ``body`` is the raw request body (str), ``auth_header`` the value of the
    ``Authorization`` header LiveKit attaches (a JWT whose ``sha256`` claim
    must match the body hash). Raises on a missing/invalid signature so the
    caller can respond 403.
    """
    if not is_configured():
        raise LiveKitNotConfigured("LiveKit is not configured.")
    if not auth_header:
        raise ValueError("Missing Authorization header on LiveKit webhook.")
    api = _require_api()
    s = get_settings()
    receiver = api.WebhookReceiver(
        api.TokenVerifier(s.LIVEKIT_API_KEY, s.LIVEKIT_API_SECRET)
    )
    return receiver.receive(body, auth_header)
