"""
Admin Audit Log model.

One row per **successful** mutation performed through the superuser
``/api/v1/admin/users`` endpoints. The table is append-only at the
application layer — no UPDATE / DELETE pathway is exposed, so the log
is a tamper-resistant record of who changed what about whom and when.

Design choices
--------------
* **FKs ON DELETE SET NULL** — keep the historical record even if a
  user is later deleted. Combined with the denormalised ``actor_email``
  / ``target_email`` columns the row remains forensically useful.
* **Denormalised emails** — captured at write time so the log doesn't
  silently lie if a user later changes their email or is hard-deleted.
* **JSONB metadata** — small bag of extra context (e.g.
  ``{"expires_at": "2026-06-23T..."}`` for plan changes). Stored as
  TEXT on SQLite for test compatibility — the migration picks the
  right type per dialect.
* **No row-level security at the DB layer** — the application is the
  trust boundary. The audit-log API endpoints enforce per-user scoping
  in SQL (``WHERE target_user_id = current_user.id`` for non-admins).
"""

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON


# Primary-key type that auto-increments on both SQLite (tests) and
# Postgres (prod). SQLite only does autoincrement on plain INTEGER
# PRIMARY KEY; BIGINT silently breaks that. ``with_variant`` keeps
# the production schema on BIGINT for headroom while letting the
# test suite run on the lightweight Integer rowid alias.
_PK_TYPE = BigInteger().with_variant(Integer(), "sqlite")

from app.models.base import Base


class AdminAuditLog(Base):
    """Append-only audit trail for superuser actions on user accounts."""

    __tablename__ = "admin_audit_logs"

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)

    # Actor (the superuser who performed the action). NULL after a hard
    # delete of the actor account — denormalised email keeps the trail
    # interpretable in that case.
    actor_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_email = Column(String(255), nullable=True)

    # Target (the user whose record was changed). Same NULL-on-delete
    # treatment as the actor.
    target_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    target_email = Column(String(255), nullable=True)

    # ``action`` is a free-form string from a small fixed set so we can
    # add new action types without a schema migration. Validation lives
    # in the writer.
    action = Column(String(64), nullable=False, index=True)

    # Old / new are the rendered values ("free" → "pro"), not raw IDs.
    # JSON-stringified for non-scalar values; the writer keeps them
    # human-readable.
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)

    # Small bag for action-specific context. JSONB on Postgres for
    # query-ability; plain JSON on SQLite (tests). Postgres-only types
    # would break the test suite.
    metadata_json = Column("metadata", JSONB().with_variant(JSON(), "sqlite"), nullable=True)

    # Forensic context — never required, but invaluable when answering
    # "where did this change come from?". Best-effort captured from the
    # request at write time.
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
