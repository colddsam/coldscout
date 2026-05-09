"""add_booking_enhancements

Revision ID: bda46036c3f6
Revises: b035ac23c181
Create Date: 2026-05-09 10:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'bda46036c3f6'
down_revision = 'b035ac23c181'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('bookings', sa.Column('proposed_times', sa.String(length=500), nullable=True))
    op.add_column('bookings', sa.Column('reminders_sent', sa.JSON(), nullable=True))

def downgrade():
    op.drop_column('bookings', 'reminders_sent')
    op.drop_column('bookings', 'proposed_times')
