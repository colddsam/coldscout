import asyncio
import sys
import os

# Add the parent directory to sys.path to allow importing app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update
from app.core.database import get_session_maker
from app.models.user import User

async def promote_user(email: str):
    """
    Directly grants superuser status to a user in the database.
    """
    SessionLocal = get_session_maker()
    async with SessionLocal() as db:
        # Check if user exists
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        
        if not user:
            print(f"❌ User with email '{email}' not found in the database.")
            return

        if user.is_superuser:
            print(f"ℹ️ User '{email}' is already a superuser.")
            return

        # Perform update
        await db.execute(
            update(User)
            .where(User.email == email)
            .values(is_superuser=True)
        )
        await db.commit()
        print(f"✅ Successfully promoted '{email}' to superuser.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python promote_user.py <email>")
        sys.exit(1)
        
    email_to_promote = sys.argv[1]
    asyncio.run(promote_user(email_to_promote))
