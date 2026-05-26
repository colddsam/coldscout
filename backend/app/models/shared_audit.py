"""
Shared Audit Report model.

One row per audit snapshot a signed-in user has chosen to share with
another party. The full audit payload is captured at share time so the
viewer always sees the same scorecard the owner saw — even if the
underlying site / Google listing changes later.

Design choices
--------------
* **Snapshot, not pointer** — ``payload_json`` carries the rendered
  ``DeepAudit`` and/or ``MapsAuditResponse`` body. We do not re-run the
  audit at view time (re-running would cost API quota and could return
  a totally different result for the same shared link).
* **Token is unguessable** — ``secrets.token_urlsafe(24)`` gives 192
  bits of entropy in a URL-safe slug. Even if an attacker knows a valid
  token exists, the search space is astronomically large.
* **Soft expiry + soft revoke** — ``expires_at`` and ``revoked_at`` are
  both honoured in the read path. We never delete rows so the owner's
  "my shared reports" view stays consistent.
* **Recipients stored as JSON list** — denormalised so we don't need a
  child table for what is almost always a 0–10 element list. The
  per-recipient email log lives in the email-sending function itself,
  not in the DB.
* **No FK on recipients** — viewers don't have to be platform users.
  Anyone with the link who signs up (or signs in) can view; the
  "viewable_by" rule is enforced in the API handler.
"""
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON

from app.models.base import Base


# Permitted ``kind`` values. Matches the flavours of audit the scanner
# page can produce. ``security`` and ``security_place`` are paid-feature
# snapshots — same share-flow, different payload shape.
KIND_WEBSITE = "website"
KIND_MAPS = "maps"
KIND_SECURITY = "security"
KIND_SECURITY_PLACE = "security_place"
ALL_KINDS = (KIND_WEBSITE, KIND_MAPS, KIND_SECURITY, KIND_SECURITY_PLACE)


class SharedAuditReport(Base):
    """A signed-in user's saved + shareable audit snapshot."""

    __tablename__ = "shared_audit_reports"
    __table_args__ = (
        # Owner timeline ("show me everything I've shared").
        Index("ix_shared_audits_owner_created", "owner_user_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Unguessable URL token. 24-byte token_urlsafe → 32 base64url chars.
    # Indexed + unique so token lookups are O(log n) and collisions are
    # impossible.
    token = Column(String(64), nullable=False, unique=True, index=True)

    # Owner — the user who clicked Share. Cascade on user delete so we
    # don't leave orphaned reports pointing at a tombstoned account.
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # 'website' (DeepAudit) or 'maps' (MapsAuditResponse).
    kind = Column(String(16), nullable=False, default=KIND_WEBSITE)

    # Human-readable label rendered in the recipient inbox and the
    # owner's "my shares" list. Defaults to the audited URL.
    title = Column(String(255), nullable=False)

    # The actual URL / business that was audited. Used for display only.
    subject_url = Column(String(2048), nullable=True)

    # Optional message the owner typed when sharing — limited to a
    # paragraph so the share modal stays light.
    message = Column(Text, nullable=True)

    # Recipients list ([{"email": "...", "sent_ok": true/false}]).
    # Kept as JSON for the same reason as ``payload_json``: we only ever
    # read the whole list and rarely query into it.
    recipients_json = Column(JSONB().with_variant(JSON(), "sqlite"), nullable=True)

    # The full audit body — the schema mirrors what the SPA renders.
    # Stored as JSONB on Postgres so we can occasionally inspect/repair
    # via SQL; SQLite (test suite) falls back to plain JSON.
    payload_json = Column(JSONB().with_variant(JSON(), "sqlite"), nullable=False)

    # View counters — incremented under a row lock in the read handler.
    # No PII captured here; only the aggregate.
    view_count = Column(Integer, nullable=False, default=0)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)

    # Soft revoke. NULL = active. The read handler refuses to render a
    # revoked report regardless of the token's validity.
    revoked_at = Column(DateTime(timezone=True), nullable=True)
