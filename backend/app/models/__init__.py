"""
SQLAlchemy ORM Model Registry.

This package-level module imports every ORM model class so that SQLAlchemy's
``Base.metadata`` is fully populated before Alembic autogeneration or any
``create_all()`` / ``upgrade head`` call is made.

Import Order:
  ``Base`` must be imported first (it carries the ``metadata`` registry).
  Subsequent model imports are in dependency order — referenced models (e.g.
  ``User``) appear before models that foreign-key into them (e.g. ``Subscription``).

Adding a new model:
  1. Create the model class in its own file under ``app/models/``.
  2. Add an import here so it registers with ``Base.metadata``.
  3. Generate a migration: ``alembic revision --autogenerate -m "add <model>"``.
"""

from app.models.base import Base

# ── Core domain models ─────────────────────────────────────────────────────────
from app.models.user import User

# ── Lead pipeline models ───────────────────────────────────────────────────────
from app.models.lead import Lead
from app.models.campaign import Campaign, EmailOutreach
from app.models.email_event import EmailEvent
from app.models.daily_report import DailyReport
from app.models.prompt_config import PromptConfig

# ── Meta Threads integration models ───────────────────────────────────────────
from app.models.threads import (
    ThreadsProfile,
    ThreadsPost,
    ThreadsEngagement,
    ThreadsSearchConfig,
    ThreadsAuth,
)

# ── Profile verification ──────────────────────────────────────────────────────
from app.models.verification import ProfileVerification

# ── Freelancer pipeline configuration ─────────────────────────────────────────
from app.models.freelancer_pipeline_config import FreelancerPipelineConfig
from app.models.freelancer_job_config import FreelancerJobConfig
from app.models.global_job_config import GlobalJobConfig

# ── Billing models (depend on User) ───────────────────────────────────────────
from app.models.subscription import Subscription, PaymentOrder
