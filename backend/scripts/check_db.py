import asyncio
import sys
import os

# Ensure the root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.core.database import get_session_maker

async def main():
    async with get_session_maker()() as db:
        r = await db.execute(text('SELECT business_name, qualification_score, lead_tier, status FROM leads;'))
        for row in r.fetchall():
            print(row)

if __name__ == '__main__':
    asyncio.run(main())
