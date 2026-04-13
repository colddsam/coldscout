"""
scripts/research_user.py
========================
Finds users matching 'samrat' to resolve typos and check current status.
"""

import asyncio
import sys
import os

# Ensure the project root is on the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import get_session_maker
from app.models.user import User
from sqlalchemy import select
from loguru import logger

async def research():
    async_session = get_session_maker()
    async with async_session() as session:
        # Search for the exact typoed email first
        res = await session.execute(select(User).where(User.email == "samratkumjardas813@gmail.com"))
        user = res.scalar_one_or_none()
        if user:
            logger.info(f"Found EXACT match for typoed email: ID {user.id}")
            print_user(user)
        
        # Search for similar emails
        res = await session.execute(select(User).where(User.email.ilike("%samrat%")))
        users = res.scalars().all()
        logger.info(f"Found {len(users)} users matching 'samrat':")
        for u in users:
            print_user(u)

def print_user(u):
    print(f"ID: {u.id} | Email: {u.email} | Role: {u.role} | Plan: {u.plan} | Admin: {u.is_superuser}")

if __name__ == "__main__":
    asyncio.run(research())
