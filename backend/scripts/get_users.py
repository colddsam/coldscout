import asyncio
from app.core.database import get_session_maker
from app.models.user import User
from app.core.security import get_password_hash
from sqlalchemy import select

async def main():
    async with get_session_maker()() as db:
        result = await db.execute(select(User).where(User.email == "[EMAIL_ADDRESS]"))
        user = result.scalars().first()
        if user:
            user.hashed_password = get_password_hash("adminpassword")
            await db.commit()
            print("Password updated to adminpassword")
        else:
            print("User not found")

if __name__ == "__main__":
    asyncio.run(main())
