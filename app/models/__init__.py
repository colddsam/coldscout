import os
from sqlalchemy import MetaData
from sqlalchemy.orm import declarative_base

# Shared Base Model for Alembic to detect
# Force 'public' schema to prevent Supabase from defaulting to 'extensions', except for sqlite tests
db_url = os.environ.get("DATABASE_URL", "")
schema = None if "sqlite" in db_url else "public"

metadata_obj = MetaData(schema=schema)
Base = declarative_base(metadata=metadata_obj)

# Import all models here so they get registered with Base
from app.models.lead import Lead
from app.models.campaign import Campaign, EmailOutreach
from app.models.email_event import EmailEvent
from app.models.daily_report import DailyReport
