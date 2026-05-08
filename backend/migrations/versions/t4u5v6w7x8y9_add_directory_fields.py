"""add directory fields (slug, is_public) to leads

Revision ID: t4u5v6w7x8y9
Revises: s3t4u5v6w7x8
Create Date: 2026-05-08 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "t4u5v6w7x8y9"
down_revision = "s3t4u5v6w7x8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add slug column (unique, nullable for backfill safety)
    op.add_column(
        "leads",
        sa.Column(
            "slug",
            sa.String(300),
            nullable=True,
            comment="URL-safe slug for the public directory (e.g. joes-plumbing-miami-fl).",
        ),
    )
    op.create_index(op.f("ix_leads_slug"), "leads", ["slug"], unique=True)

    # Add is_public boolean (default False)
    op.add_column(
        "leads",
        sa.Column(
            "is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="True when lead is eligible for the public directory (>30 days, not closed).",
        ),
    )
    op.create_index(op.f("ix_leads_is_public"), "leads", ["is_public"])

    # ── Backfill slugs on existing rows ──────────────────────────────────
    # We use raw SQL for bulk efficiency. The slug is built from:
    #   lower(business_name) || '-' || lower(coalesce(city,'')) || '-' || lower(coalesce(state,''))
    # with non-alphanumeric chars replaced by hyphens, then trimmed.
    # Collisions are resolved by appending '-' || left(id::text, 8).
    #
    # Step 1: Build base slugs
    op.execute(
        """
        UPDATE leads
        SET slug = regexp_replace(
            regexp_replace(
                lower(
                    business_name
                    || '-'
                    || coalesce(city, '')
                    || '-'
                    || coalesce(state, coalesce(region, ''))
                ),
                '[^a-z0-9]+', '-', 'g'
            ),
            '^-+|-+$', '', 'g'
        )
        WHERE slug IS NULL;
        """
    )

    # Step 2: Resolve collisions by appending truncated UUID
    op.execute(
        """
        UPDATE leads AS l
        SET slug = l.slug || '-' || left(l.id::text, 8)
        WHERE l.slug IN (
            SELECT slug FROM leads
            GROUP BY slug HAVING count(*) > 1
        );
        """
    )

    # ── Backfill is_public for eligible leads ─────────────────────────────
    # Leads older than 30 days that aren't closed/rejected/claimed
    op.execute(
        """
        UPDATE leads
        SET is_public = true
        WHERE discovered_at < (now() - interval '30 days')
          AND status NOT IN ('closed', 'rejected', 'unsubscribed', 'bounced')
          AND slug IS NOT NULL
          AND slug != '';
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_leads_is_public"), table_name="leads")
    op.drop_column("leads", "is_public")
    op.drop_index(op.f("ix_leads_slug"), table_name="leads")
    op.drop_column("leads", "slug")
