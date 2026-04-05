"""Add international location hierarchy fields

Revision ID: g1h2i3j4k5l6
Revises: f1a2b3c4d5e6
Create Date: 2026-04-05

Adds country, country_code, region, sub_area, postal_code, latitude, longitude
to the leads table. Extends search_history with country, country_code, region,
sub_area, location_depth, results_count for international deduplication.

Backfills existing data with country='India', country_code='IN' since all
current leads were discovered targeting Indian cities.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g1h2i3j4k5l6'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Lead table: international location fields ────────────────────────────
    op.add_column('leads', sa.Column('country', sa.String(100), nullable=True))
    op.add_column('leads', sa.Column('country_code', sa.String(5), nullable=True))
    op.add_column('leads', sa.Column('region', sa.String(150), nullable=True))
    op.add_column('leads', sa.Column('sub_area', sa.String(150), nullable=True))
    op.add_column('leads', sa.Column('postal_code', sa.String(20), nullable=True))
    op.add_column('leads', sa.Column('latitude', sa.Float(), nullable=True))
    op.add_column('leads', sa.Column('longitude', sa.Float(), nullable=True))

    op.create_index('ix_leads_country', 'leads', ['country'])
    op.create_index('ix_leads_country_code', 'leads', ['country_code'])
    op.create_index('ix_leads_country_region_city', 'leads', ['country_code', 'region', 'city'])

    # ── SearchHistory table: international hierarchy fields ──────────────────
    op.add_column('search_history', sa.Column('country', sa.String(100), nullable=True))
    op.add_column('search_history', sa.Column('country_code', sa.String(5), nullable=True))
    op.add_column('search_history', sa.Column('region', sa.String(150), nullable=True))
    op.add_column('search_history', sa.Column('sub_area', sa.String(150), nullable=True))
    op.add_column('search_history', sa.Column('location_depth', sa.String(20), nullable=False, server_default='city'))
    op.add_column('search_history', sa.Column('results_count', sa.Integer(), nullable=True, server_default='0'))

    op.create_index('ix_search_history_country', 'search_history', ['country'])
    op.create_index('ix_search_history_country_code', 'search_history', ['country_code'])
    op.create_index('ix_search_history_region', 'search_history', ['region'])
    op.create_index('ix_search_history_sub_area', 'search_history', ['sub_area'])

    # ── Backfill existing data ───────────────────────────────────────────────
    # All existing leads and search history entries were India-only
    op.execute("UPDATE leads SET country = 'India', country_code = 'IN' WHERE country IS NULL")
    op.execute("UPDATE search_history SET country = 'India', country_code = 'IN' WHERE country IS NULL")


def downgrade() -> None:
    # ── SearchHistory: drop new columns and indexes ──────────────────────────
    op.drop_index('ix_search_history_sub_area', table_name='search_history')
    op.drop_index('ix_search_history_region', table_name='search_history')
    op.drop_index('ix_search_history_country_code', table_name='search_history')
    op.drop_index('ix_search_history_country', table_name='search_history')

    op.drop_column('search_history', 'results_count')
    op.drop_column('search_history', 'location_depth')
    op.drop_column('search_history', 'sub_area')
    op.drop_column('search_history', 'region')
    op.drop_column('search_history', 'country_code')
    op.drop_column('search_history', 'country')

    # ── Lead: drop new columns and indexes ───────────────────────────────────
    op.drop_index('ix_leads_country_region_city', table_name='leads')
    op.drop_index('ix_leads_country_code', table_name='leads')
    op.drop_index('ix_leads_country', table_name='leads')

    op.drop_column('leads', 'longitude')
    op.drop_column('leads', 'latitude')
    op.drop_column('leads', 'postal_code')
    op.drop_column('leads', 'sub_area')
    op.drop_column('leads', 'region')
    op.drop_column('leads', 'country_code')
    op.drop_column('leads', 'country')
