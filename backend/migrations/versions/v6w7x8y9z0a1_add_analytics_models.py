"""add_analytics_models

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-05-12 09:00:00.000000

Creates the daily_snapshots cache table and adds an email_events.sentiment
column for AI-classified reply intent. Both back the Advanced Analytics
& Insights dashboard.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'v6w7x8y9z0a1'
down_revision = 'u5v6w7x8y9z0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add sentiment column to email_events
    op.add_column(
        'email_events',
        sa.Column('sentiment', sa.String(length=20), nullable=True),
    )
    op.create_index(
        'ix_email_events_sentiment', 'email_events', ['sentiment'],
    )

    # 2. Create daily_snapshots cache table
    op.create_table(
        'daily_snapshots',
        sa.Column(
            'id',
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column(
            'user_id',
            sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('leads_found', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('leads_qualified', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('emails_sent', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('emails_opened', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('links_clicked', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('replies_received', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('replies_positive', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('replies_neutral', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('replies_negative', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unsubscribes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column(
            'computed_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.UniqueConstraint(
            'user_id', 'snapshot_date', name='uq_daily_snapshots_user_date'
        ),
    )
    op.create_index(
        'ix_daily_snapshots_user_id', 'daily_snapshots', ['user_id'],
    )
    op.create_index(
        'ix_daily_snapshots_snapshot_date', 'daily_snapshots', ['snapshot_date'],
    )


def downgrade() -> None:
    op.drop_index('ix_daily_snapshots_snapshot_date', table_name='daily_snapshots')
    op.drop_index('ix_daily_snapshots_user_id', table_name='daily_snapshots')
    op.drop_table('daily_snapshots')
    op.drop_index('ix_email_events_sentiment', table_name='email_events')
    op.drop_column('email_events', 'sentiment')
