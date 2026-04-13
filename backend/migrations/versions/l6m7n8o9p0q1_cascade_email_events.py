"""Add ON DELETE CASCADE to email_events and email_outreach foreign keys

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-04-12

Ensures orphaned rows are cleaned up at the database level when a parent
record (lead, campaign, outreach) is deleted. Previously the SQLAlchemy
relationship cascade was configured in Python, but the foreign key itself
had no ON DELETE action — so direct SQL deletes (or bulk deletes that bypass
the session) would leave orphans or fail with FK violations.
"""
from alembic import op


revision = "l6m7n8o9p0q1"
down_revision = "k5l6m7n8o9p0"
branch_labels = None
depends_on = None


# (table, constraint_name, column, referred_table, referred_column)
FK_UPDATES = [
    ("email_events", "email_events_lead_id_fkey", "lead_id", "leads", "id"),
    ("email_events", "email_events_outreach_id_fkey", "outreach_id", "email_outreach", "id"),
    ("email_outreach", "email_outreach_campaign_id_fkey", "campaign_id", "campaigns", "id"),
]


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # SQLite cannot ALTER foreign keys; skip (tests only).
    if dialect == "sqlite":
        return

    for table, name, column, ref_table, ref_column in FK_UPDATES:
        try:
            op.drop_constraint(name, table, type_="foreignkey")
        except Exception:
            # Constraint name may differ on older databases — best-effort drop.
            pass
        op.create_foreign_key(
            name,
            table,
            ref_table,
            [column],
            [ref_column],
            ondelete="CASCADE",
        )

    # Index on email_outreach.campaign_id for faster cascade lookups
    try:
        op.create_index(
            "ix_email_outreach_campaign_id",
            "email_outreach",
            ["campaign_id"],
        )
    except Exception:
        pass


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        return

    try:
        op.drop_index("ix_email_outreach_campaign_id", table_name="email_outreach")
    except Exception:
        pass

    for table, name, column, ref_table, ref_column in FK_UPDATES:
        try:
            op.drop_constraint(name, table, type_="foreignkey")
        except Exception:
            pass
        op.create_foreign_key(
            name,
            table,
            ref_table,
            [column],
            [ref_column],
        )
