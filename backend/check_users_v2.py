
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://postgres.bbmvzahgkrmkciiejunt:SamratSaheli@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

async def check_users():
    # Use a minimal pool size to avoid connection limits
    engine = create_async_engine(DATABASE_URL, pool_size=1, max_overflow=0)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT username, email FROM user_profiles JOIN users ON users.id = user_profiles.user_id LIMIT 10"))
            rows = result.fetchall()
            if not rows:
                print("No profiles found.")
            for row in rows:
                print(f"Username: {row[0]}, Email: {row[1]}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_users())
