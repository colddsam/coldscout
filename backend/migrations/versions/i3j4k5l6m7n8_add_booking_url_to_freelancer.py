"""Add booking_url to freelancer_profiles

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-04-06

Adds booking_url column to freelancer_profiles table so users can store
their external scheduling link (Calendly, Cal.com, etc.).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "i3j4k5l6m7n8"
down_revision = "h2i3j4k5l6m7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "freelancer_profiles",
        sa.Column("booking_url", sa.String(500), nullable=True),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("freelancer_profiles", "booking_url", schema="public")
