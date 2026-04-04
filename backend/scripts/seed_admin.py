"""
scripts/seed_admin.py
=====================
One-time setup script for creating the initial superuser (admin) account.

**When to run this:**
Run this script once on a fresh deployment after the database tables have been
created (via `alembic upgrade head` or `scripts/create_tables.py`). Without a
valid admin account, you cannot log into the dashboard or use any authenticated
API endpoints.

**How it works:**
1. Reads the `ADMIN_EMAIL` from your `.env` / environment settings.
2. Checks if a user with that email already exists in the database.
3. If not found, creates a new superuser with a hashed password.

**Usage:**
    cd "AI LEAD GENERATION"
    python scripts/seed_admin.py

**Security Note:**
The default password is set to `admin_password_123`. You MUST log into the
dashboard immediately after running this and change the password from the
Settings page before deploying to production.
"""

import asyncio
import sys
import os

# Ensure the project root is on the path so we can import from `app/`
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import get_session_maker
from app.models.user import User
from app.core import security
from app.config import get_settings
from sqlalchemy import select
from loguru import logger


async def seed_admin():
    """
    Asynchronously create the admin user if one does not already exist.

    This is an idempotent operation — running it twice will not create a
    duplicate account. The second run simply logs a message and exits cleanly.
    """
    settings = get_settings()
    email = settings.ADMIN_EMAIL
    
    # Securely handle the initial password
    password = os.environ.get("INITIAL_ADMIN_PASSWORD")
    is_random = False
    
    if not password:
        import secrets
        import string
        alphabet = string.ascii_letters + string.digits
        password = ''.join(secrets.choice(alphabet) for i in range(16))
        is_random = True

    async_session = get_session_maker()
    async with async_session() as session:
        # Check if an admin with this email is already registered
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalars().first()

        if user:
            logger.info(f"Admin user {email} already exists. No action taken.")
            return

        logger.info(f"Creating superuser account for: {email} ...")
        new_user = User(
            email=email,
            hashed_password=security.get_password_hash(password),
            is_active=True,
            is_superuser=True,
        )
        session.add(new_user)
        await session.commit()
        
        if is_random:
            logger.info(
                f"✅ Admin user '{email}' created with a GENERATED password: '{password}'"
            )
            logger.warning("Please save this password immediately! It will not be shown again.")
        else:
            logger.info(
                f"✅ Admin user '{email}' created using INITIAL_ADMIN_PASSWORD from environment."
            )


if __name__ == "__main__":
    asyncio.run(seed_admin())
