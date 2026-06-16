"""add native meeting rooms (LiveKit branded video) + agency colour

Revision ID: z0a1b2c3d4e5
Revises: y9z0a1b2c3d4
Create Date: 2026-06-07 12:00:00.000000

Adds the native in-app video columns to ``bookings`` (room_id, lifecycle,
CRM link, transcript/summary fields) and ``agency_primary_color`` to
``freelancer_profiles`` for white-labeling the /meet/{room_id} experience.

Dialect-aware so the same migration runs on Postgres (production) and
SQLite (tests): UUID/JSONB degrade to CHAR(36)/JSON.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


# revision identifiers, used by Alembic.
revision = "z0a1b2c3d4e5"
down_revision = "y9z0a1b2c3d4"
branch_labels = None
depends_on = None


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _uuid_type():
    return UUID(as_uuid=True) if _is_pg() else sa.String(length=36)


def _json_type():
    return JSONB if _is_pg() else sa.JSON


def upgrade() -> None:
    # ── bookings: native video columns ──────────────────────────────────────
    op.add_column("bookings", sa.Column("room_id", sa.String(length=64), nullable=True))
    op.add_column("bookings", sa.Column("provider", sa.String(length=20), nullable=True))
    op.add_column(
        "bookings",
        sa.Column(
            "meeting_status",
            sa.String(length=20),
            nullable=False,
            server_default="planned",
        ),
    )
    op.add_column("bookings", sa.Column("host_notes", sa.Text(), nullable=True))
    op.add_column("bookings", sa.Column("actual_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("actual_end_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("meeting_duration_seconds", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("recording_url", sa.String(length=1000), nullable=True))
    op.add_column("bookings", sa.Column("transcript", sa.Text(), nullable=True))
    op.add_column("bookings", sa.Column("meeting_summary", sa.Text(), nullable=True))
    op.add_column("bookings", sa.Column("next_steps", _json_type(), nullable=True))

    # CRM link to the lead. FK is enforced on Postgres; on SQLite we add a
    # bare column (ALTER ADD COLUMN can't add a cross-table FK without batch
    # mode, and SQLite doesn't enforce it anyway in this test path).
    if _is_pg():
        op.add_column(
            "bookings",
            sa.Column(
                "lead_id",
                _uuid_type(),
                sa.ForeignKey("leads.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    else:
        op.add_column("bookings", sa.Column("lead_id", _uuid_type(), nullable=True))

    op.create_index(op.f("ix_bookings_room_id"), "bookings", ["room_id"], unique=True)
    op.create_index(op.f("ix_bookings_lead_id"), "bookings", ["lead_id"])

    # ── freelancer_profiles: white-label accent colour ──────────────────────
    op.add_column(
        "freelancer_profiles",
        sa.Column("agency_primary_color", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("freelancer_profiles", "agency_primary_color")

    op.drop_index(op.f("ix_bookings_lead_id"), table_name="bookings")
    op.drop_index(op.f("ix_bookings_room_id"), table_name="bookings")

    for col in (
        "lead_id",
        "next_steps",
        "meeting_summary",
        "transcript",
        "recording_url",
        "meeting_duration_seconds",
        "actual_end_at",
        "actual_start_at",
        "host_notes",
        "meeting_status",
        "provider",
        "room_id",
    ):
        op.drop_column("bookings", col)
