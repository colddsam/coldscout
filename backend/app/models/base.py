"""
Database Foundation Module

This module defines the SQLAlchemy declarative base used by all models in the system.
It includes specific logic for schema handling to ensure compatibility across different
database backends (PostgreSQL for production/Supabase vs. SQLite for local testing).

Classes:
    Base: The shared base model for all database tables, used by Alembic for schema migrations.
    metadata_obj: The SQLAlchemy metadata object, configured with the correct schema based on the database URL.

Functions:
    None
"""

import os
from sqlalchemy import MetaData
from sqlalchemy.orm import declarative_base

# Define the shared base model for Alembic to detect
# Force 'public' schema to prevent Supabase from defaulting to 'extensions', except for sqlite tests.
# This ensures that our tables are created in the standard PostgreSQL location.
db_url = os.environ.get("DATABASE_URL", "")
schema = None if "sqlite" in db_url else "public"

# Create the SQLAlchemy metadata object with the correct schema
metadata_obj = MetaData(schema=schema)

# Define the shared base model for all database tables
"""
Base Model

The base model for all database tables, used by Alembic for schema migrations.
"""
Base = declarative_base(metadata=metadata_obj)