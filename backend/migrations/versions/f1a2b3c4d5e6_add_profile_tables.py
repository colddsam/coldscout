"""Add profile tables (user_profiles, business_profiles, freelancer_profiles, portfolio_items)

Revision ID: f1a2b3c4d5e6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-30 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create profile system tables."""

    # ── user_profiles ─────────────────────────────────────────────────────
    op.create_table(
        'user_profiles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('username', sa.String(50), nullable=False, unique=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('gender', sa.String(30), nullable=True),
        sa.Column('date_of_birth', sa.DateTime(timezone=True), nullable=True),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('location', sa.String(200), nullable=True),
        sa.Column('website', sa.String(500), nullable=True),
        sa.Column('profile_photo_url', sa.String(1000), nullable=True),
        sa.Column('banner_url', sa.String(1000), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('show_email', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('show_phone', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('show_location', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('show_date_of_birth', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema='public',
    )
    op.create_index('ix_user_profiles_user_id', 'user_profiles', ['user_id'], schema='public')
    op.create_index('ix_user_profiles_username', 'user_profiles', ['username'], unique=True, schema='public')

    # ── business_profiles ─────────────────────────────────────────────────
    op.create_table(
        'business_profiles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('company_name', sa.String(200), nullable=True),
        sa.Column('brand_name', sa.String(200), nullable=True),
        sa.Column('industry', sa.String(100), nullable=True),
        sa.Column('company_size', sa.String(50), nullable=True),
        sa.Column('founded_year', sa.Integer(), nullable=True),
        sa.Column('company_website', sa.String(500), nullable=True),
        sa.Column('company_logo_url', sa.String(1000), nullable=True),
        sa.Column('company_description', sa.Text(), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(100), nullable=True),
        sa.Column('country', sa.String(100), nullable=True),
        sa.Column('postal_code', sa.String(20), nullable=True),
        sa.Column('linkedin_url', sa.String(500), nullable=True),
        sa.Column('twitter_url', sa.String(500), nullable=True),
        sa.Column('facebook_url', sa.String(500), nullable=True),
        sa.Column('instagram_url', sa.String(500), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema='public',
    )
    op.create_index('ix_business_profiles_user_id', 'business_profiles', ['user_id'], schema='public')

    # ── freelancer_profiles ───────────────────────────────────────────────
    op.create_table(
        'freelancer_profiles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('professional_title', sa.String(200), nullable=True),
        sa.Column('skills', sa.JSON(), nullable=True),
        sa.Column('experience_years', sa.Integer(), nullable=True),
        sa.Column('hourly_rate', sa.String(50), nullable=True),
        sa.Column('availability', sa.String(50), nullable=True),
        sa.Column('languages', sa.JSON(), nullable=True),
        sa.Column('education', sa.Text(), nullable=True),
        sa.Column('certifications', sa.JSON(), nullable=True),
        sa.Column('linkedin_url', sa.String(500), nullable=True),
        sa.Column('github_url', sa.String(500), nullable=True),
        sa.Column('twitter_url', sa.String(500), nullable=True),
        sa.Column('dribbble_url', sa.String(500), nullable=True),
        sa.Column('behance_url', sa.String(500), nullable=True),
        sa.Column('personal_website', sa.String(500), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('show_rates', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('show_availability', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema='public',
    )
    op.create_index('ix_freelancer_profiles_user_id', 'freelancer_profiles', ['user_id'], schema='public')

    # ── portfolio_items ───────────────────────────────────────────────────
    op.create_table(
        'portfolio_items',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('project_url', sa.String(500), nullable=True),
        sa.Column('image_url', sa.String(1000), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('client_name', sa.String(200), nullable=True),
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        schema='public',
    )
    op.create_index('ix_portfolio_items_user_id', 'portfolio_items', ['user_id'], schema='public')


def downgrade() -> None:
    """Drop profile system tables."""
    op.drop_table('portfolio_items', schema='public')
    op.drop_table('freelancer_profiles', schema='public')
    op.drop_table('business_profiles', schema='public')
    op.drop_table('user_profiles', schema='public')
