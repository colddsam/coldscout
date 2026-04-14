"""Per-freelancer job config + DB-backed global job config

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-04-14

Adds:
  - ``global_job_configs`` — supersedes ``jobs_config.json``.
  - ``freelancer_job_configs`` — per-(user, job) override row.

Seeds ``global_job_configs`` from the existing default matrix so the
system keeps running without manual intervention. If a legacy
``jobs_config.json`` file is present on the filesystem at migration
time it is imported; otherwise the hard-coded defaults apply.
"""
from __future__ import annotations

import json
import os

from alembic import op
import sqlalchemy as sa


revision = "o9p0q1r2s3t4"
down_revision = "n8o9p0q1r2s3"
branch_labels = None
depends_on = None


# Hard-coded fallback seed identical to the previous JSON defaults.
# Keep in sync with ``app/core/job_manager.py::DEFAULT_JOBS_CONFIG``.
_DEFAULT_SEED = [
    {"job_id": "discovery",             "status": "RUN",  "type": "cron",     "hour": 3,  "minute": 0},
    {"job_id": "qualification",         "status": "RUN",  "type": "cron",     "hour": 5,  "minute": 0},
    {"job_id": "personalization",       "status": "RUN",  "type": "cron",     "hour": 7,  "minute": 0},
    {"job_id": "outreach",              "status": "RUN",  "type": "cron",     "hour": 9,  "minute": 0},
    {"job_id": "reply_poll",            "status": "RUN",  "type": "interval", "minutes": 30},
    {"job_id": "daily_report",          "status": "RUN",  "type": "cron",     "hour": 20, "minute": 0},
    {"job_id": "followup_dispatch",     "status": "RUN",  "type": "cron",     "hour": 10, "minute": 0},
    {"job_id": "weekly_optimization",   "status": "RUN",  "type": "cron",     "day_of_week": "sun", "hour": 11, "minute": 0},
    {"job_id": "threads_discovery",     "status": "HOLD", "type": "cron",     "hour": 10, "minute": 0},
    {"job_id": "threads_qualification", "status": "HOLD", "type": "cron",     "hour": 11, "minute": 0},
    {"job_id": "threads_engagement",    "status": "HOLD", "type": "cron",     "hour": 12, "minute": 0},
    {"job_id": "threads_response_check","status": "HOLD", "type": "interval", "minutes": 30},
]


def _load_legacy_json_seed() -> list[dict]:
    """Import a ``config/jobs_config.json`` file if it still exists."""
    legacy_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "config",
        "jobs_config.json",
    )
    if not os.path.exists(legacy_path):
        return []
    try:
        with open(legacy_path, "r", encoding="utf-8") as f:
            raw = json.load(f)
        rows: list[dict] = []
        for job_id, cfg in raw.items():
            if not isinstance(cfg, dict):
                continue
            rows.append({
                "job_id": job_id,
                "status": str(cfg.get("status", "RUN")).upper(),
                "type": cfg.get("type", "cron"),
                "hour": cfg.get("hour"),
                "minute": cfg.get("minute"),
                "minutes": cfg.get("minutes"),
                "day_of_week": cfg.get("day_of_week"),
            })
        return rows
    except Exception:
        return []


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    schema_kw = {} if dialect == "sqlite" else {"schema": "public"}

    global_table = op.create_table(
        "global_job_configs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_id", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="RUN"),
        sa.Column("type", sa.String(16), nullable=False, server_default="cron"),
        sa.Column("hour", sa.Integer(), nullable=True),
        sa.Column("minute", sa.Integer(), nullable=True),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("day_of_week", sa.String(8), nullable=True),
        sa.Column(
            "updated_by",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        **schema_kw,
    )
    op.create_index(
        "ix_global_job_configs_job_id",
        "global_job_configs",
        ["job_id"],
        **schema_kw,
    )

    op.create_table(
        "freelancer_job_configs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("job_id", sa.String(64), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="RUN"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "job_id", name="uq_freelancer_job_configs_user_job"),
        **schema_kw,
    )
    op.create_index(
        "ix_freelancer_job_configs_user_id",
        "freelancer_job_configs",
        ["user_id"],
        **schema_kw,
    )
    op.create_index(
        "ix_freelancer_job_configs_job_id",
        "freelancer_job_configs",
        ["job_id"],
        **schema_kw,
    )

    # Seed defaults — prefer existing JSON if present so we preserve the
    # operator's current schedule tweaks.
    seed_rows = _load_legacy_json_seed() or _DEFAULT_SEED
    if seed_rows:
        op.bulk_insert(global_table, seed_rows)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    schema_kw = {} if dialect == "sqlite" else {"schema": "public"}

    op.drop_index("ix_freelancer_job_configs_job_id", table_name="freelancer_job_configs", **schema_kw)
    op.drop_index("ix_freelancer_job_configs_user_id", table_name="freelancer_job_configs", **schema_kw)
    op.drop_table("freelancer_job_configs", **schema_kw)

    op.drop_index("ix_global_job_configs_job_id", table_name="global_job_configs", **schema_kw)
    op.drop_table("global_job_configs", **schema_kw)
