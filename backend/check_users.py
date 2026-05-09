import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.config import get_settings

DATABASE_URL = get_settings().DATABASE_URL

async def check_users():
    engine = create_async_engine(DATABASE_URL)
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT username, email FROM user_profiles JOIN users ON users.id = user_profiles.user_id"))
        rows = result.fetchall()
        for row in rows:
            print(f"Username: {row[0]}, Email: {row[1]}")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_users())
