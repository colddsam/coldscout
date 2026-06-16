"""add freelancer meeting_provider preference

Revision ID: c4d5e6f7a8b9
Revises: z0a1b2c3d4e5
Create Date: 2026-06-16 12:00:00.000000

Adds ``freelancer_profiles.meeting_provider`` so a freelancer can opt public
bookings into native branded /meet/{room_id} video rooms. NULL/'auto' keeps the
existing behaviour (Google Meet → permanent meeting_link); 'native' mints a
branded room per booking with graceful fallback when LiveKit/plan is unavailable.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c4d5e6f7a8b9"
down_revision = "z0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "freelancer_profiles",
        sa.Column("meeting_provider", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("freelancer_profiles", "meeting_provider")
