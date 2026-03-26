"""v4_threads_lead_gen

Creates 5 new tables for the Meta Threads lead generation channel:
  1. threads_profiles   - Discovered user profiles
  2. threads_posts      - Cached post content for deduplication
  3. threads_engagements - Reply interaction tracking
  4. threads_search_configs - Admin-configurable keywords
  5. threads_auth       - OAuth token storage

Also adds two new columns to the leads table:
  - source_channel: Tracks which channel (google_places, threads, manual) generated the lead
  - threads_profile_id: Optional FK link to a Threads profile

SAFE: Only adds new tables and nullable columns — zero impact on existing data.

Revision ID: d7e3a1f29c42
Revises: c3f21d9e77b1
Create Date: 2026-03-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision: str = 'd7e3a1f29c42'
down_revision: Union[str, None] = '0dfbaa4bb489'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. threads_auth ─────────────────────────────────────────
    op.create_table(
        'threads_auth',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('threads_user_id', sa.String(100), nullable=False, unique=True),
        sa.Column('access_token', sa.Text(), nullable=False),
        sa.Column('token_type', sa.String(20), server_default='long_lived'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema='public',
    )
    op.create_index('ix_threads_auth_threads_user_id', 'threads_auth',
                    ['threads_user_id'], schema='public')

    # ── 2. threads_search_configs ───────────────────────────────
    op.create_table(
        'threads_search_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('keyword', sa.String(255), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('search_type', sa.String(10), server_default='RECENT'),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('last_searched_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_results_per_search', sa.Integer(), server_default=sa.text('25')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema='public',
    )
    op.create_index('ix_threads_search_configs_keyword', 'threads_search_configs',
                    ['keyword'], schema='public')
    op.create_index('ix_threads_search_configs_is_active', 'threads_search_configs',
                    ['is_active'], schema='public')

    # ── 3. threads_profiles ─────────────────────────────────────
    op.create_table(
        'threads_profiles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('threads_user_id', sa.String(100), nullable=False, unique=True),
        sa.Column('username', sa.String(255), nullable=True),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('followers_count', sa.Integer(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('profile_picture_url', sa.String(), nullable=True),
        sa.Column('lead_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('qualification_status', sa.String(50), server_default='pending'),
        sa.Column('ai_score', sa.Integer(), server_default=sa.text('0')),
        sa.Column('qualification_notes', sa.Text(), nullable=True),
        sa.Column('discovered_via', sa.String(50), server_default='keyword_search'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['lead_id'], ['public.leads.id'], ondelete='SET NULL'),
        schema='public',
    )
    op.create_index('ix_threads_profiles_threads_user_id', 'threads_profiles',
                    ['threads_user_id'], schema='public')
    op.create_index('ix_threads_profiles_username', 'threads_profiles',
                    ['username'], schema='public')
    op.create_index('ix_threads_profiles_lead_id', 'threads_profiles',
                    ['lead_id'], schema='public')
    op.create_index('ix_threads_profiles_qualification_status', 'threads_profiles',
                    ['qualification_status'], schema='public')

    # ── 4. threads_posts ────────────────────────────────────────
    op.create_table(
        'threads_posts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('threads_media_id', sa.String(100), nullable=False, unique=True),
        sa.Column('threads_profile_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('post_type', sa.String(20), server_default='TEXT'),
        sa.Column('permalink', sa.String(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.Column('like_count', sa.Integer(), nullable=True),
        sa.Column('reply_count', sa.Integer(), nullable=True),
        sa.Column('repost_count', sa.Integer(), nullable=True),
        sa.Column('search_keyword', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['threads_profile_id'], ['public.threads_profiles.id'],
                                ondelete='CASCADE'),
        schema='public',
    )
    op.create_index('ix_threads_posts_threads_media_id', 'threads_posts',
                    ['threads_media_id'], schema='public')
    op.create_index('ix_threads_posts_threads_profile_id', 'threads_posts',
                    ['threads_profile_id'], schema='public')
    op.create_index('ix_threads_posts_search_keyword', 'threads_posts',
                    ['search_keyword'], schema='public')

    # ── 5. threads_engagements ──────────────────────────────────
    op.create_table(
        'threads_engagements',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('threads_profile_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('threads_post_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('reply_threads_media_id', sa.String(100), nullable=True, unique=True),
        sa.Column('reply_text', sa.Text(), nullable=False),
        sa.Column('engagement_type', sa.String(30), server_default='reply'),
        sa.Column('status', sa.String(30), server_default='pending'),
        sa.Column('ai_generated', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('replied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('response_received_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('response_text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['threads_profile_id'], ['public.threads_profiles.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['threads_post_id'], ['public.threads_posts.id'],
                                ondelete='CASCADE'),
        schema='public',
    )
    op.create_index('ix_threads_engagements_threads_profile_id', 'threads_engagements',
                    ['threads_profile_id'], schema='public')
    op.create_index('ix_threads_engagements_threads_post_id', 'threads_engagements',
                    ['threads_post_id'], schema='public')
    op.create_index('ix_threads_engagements_status', 'threads_engagements',
                    ['status'], schema='public')

    # ── 6. Extend existing leads table (SAFE - nullable columns) ──
    op.add_column(
        'leads',
        sa.Column('source_channel', sa.String(50), server_default='google_places', nullable=True),
        schema='public',
    )
    op.add_column(
        'leads',
        sa.Column('threads_profile_id', postgresql.UUID(as_uuid=True), nullable=True),
        schema='public',
    )


def downgrade() -> None:
    # ── Remove added lead columns first ─────────────────────────
    op.drop_column('leads', 'threads_profile_id', schema='public')
    op.drop_column('leads', 'source_channel', schema='public')

    # ── Drop new tables in reverse dependency order ─────────────
    op.drop_table('threads_engagements', schema='public')
    op.drop_table('threads_posts', schema='public')
    op.drop_table('threads_profiles', schema='public')
    op.drop_table('threads_search_configs', schema='public')
    op.drop_table('threads_auth', schema='public')
