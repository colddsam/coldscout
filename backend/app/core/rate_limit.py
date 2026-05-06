"""
Application-wide rate limiter (slowapi).

A single ``Limiter`` instance is shared across all routers so the same
sliding window is enforced regardless of which endpoint a client hits.
Endpoints opt in with ``@limiter.limit("10/minute")`` decorators; the
limiter itself is mounted on ``app.state`` in ``main.py``.

Why a dedicated module
----------------------
Importing the limiter from ``main.py`` would create a circular import as
soon as a router needs the decorator. Keeping it in ``core/`` lets every
router import freely without dragging in FastAPI's app object.

Keying
------
By default we key on the caller's remote IP via ``get_remote_address``.
Behind a reverse proxy (Vercel / nginx / Cloudflare) FastAPI sees the
proxy IP, so operators must ensure the ``X-Forwarded-For`` header is
trusted by the deploy target — slowapi's ``get_remote_address`` already
honours that header when present.
"""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address


limiter = Limiter(
    key_func=get_remote_address,
    # No default global limit — endpoints opt in. Leaving this empty
    # means an undecorated endpoint behaves exactly as it did before
    # slowapi was wired up (zero risk of accidental throttling on
    # the existing pipeline / billing / leads APIs).
    default_limits=[],
    # Headers ("X-RateLimit-*") help honest clients back off without
    # a 429. Cheap to emit and useful for the scanner UI.
    headers_enabled=True,
)
