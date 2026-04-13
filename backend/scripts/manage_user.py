"""
scripts/manage_user.py
======================
Comprehensive User Management CLI for Cold Scout.

Usage:
  python scripts/manage_user.py --email user@example.com --plan pro --role freelancer --admin
  python scripts/manage_user.py --id 12 --plan free --role client --no-admin --dry-run
"""

import asyncio
import argparse
import sys
import os

# Ensure the project root is on the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import get_session_maker
from app.models.user import User
from app.models.freelancer_pipeline_config import FreelancerPipelineConfig
from app.models.lead import Lead, SearchHistory
from app.models.campaign import Campaign
from app.models.daily_report import DailyReport
from sqlalchemy import select, update, delete
from loguru import logger

async def manage_user(args):
    async_session = get_session_maker()
    async with async_session() as session:
        # 0. Handle List/Audit
        if args.list:
            # Fetch all users
            result = await session.execute(select(User).order_by(User.id))
            users = result.scalars().all()
            
            # Fetch all configs
            config_res = await session.execute(select(FreelancerPipelineConfig))
            configs = {c.user_id: c.production_status for c in config_res.scalars().all()}

            print("\n" + "="*95)
            print(f"{'ID':<4} | {'Email':<30} | {'Role':<12} | {'Plan':<10} | {'Admin':<6} | {'Active':<6} | {'Pipeline':<8}")
            print("-" * 95)
            
            for user in users:
                pipeline_status = configs.get(user.id, "N/A")
                print(f"{user.id:<4} | {user.email:<30} | {user.role:<12} | {user.plan:<10} | {str(user.is_superuser):<6} | {str(user.is_active):<6} | {pipeline_status:<8}")
            
            print("="*95 + "\n")
            return

        # 1. Find the user
        if args.id:
            stmt = select(User).where(User.id == args.id)
        elif args.email:
            stmt = select(User).where(User.email == args.email)
        else:
            logger.error("Must provide --id, --email, or --list")
            return

        res = await session.execute(stmt)
        user = res.scalar_one_or_none()
        
        if not user:
            logger.error("User not found!")
            return

        logger.info(f"Target User: {user.email} (ID: {user.id})")
        logger.info(f"Current State: Plan={user.plan}, Role={user.role}, Admin={user.is_superuser}, Active={user.is_active}")

        # 2. Handle Deletion (High Risk)
        if args.delete:
            if not args.force:
                print(f"\n[CAUTION] You are about to PERMANENTLY DELETE user {user.email} and ALL associated data (Leads, Campaigns, Reports, etc.).")
                confirm = input(f"Type the user's email '{user.email}' to confirm deletion: ")
                if confirm.strip() != user.email:
                    logger.error("Confirmation failed. Deletion aborted.")
                    return

            if args.dry_run:
                logger.info("DRY RUN: User would be deleted.")
                return

            await session.delete(user)
            await session.commit()
            logger.info(f"✅ Successfully DELETED user {user.email} and all associated records.")
            return

        # 3. Build the update
        updates = {}
        if args.plan:
            updates["plan"] = args.plan
        if args.role:
            updates["role"] = args.role
        if args.admin is not None:
            updates["is_superuser"] = args.admin
        if args.active is not None:
            updates["is_active"] = args.active

        if not updates:
            logger.warning("No changes specified. Use --plan, --role, --admin, --active, or --delete.")
            return

        logger.info(f"Proposed Changes: {updates}")

        target_role = updates.get("role", user.role)

        # 4. Dry Run Report
        if args.dry_run:
            logger.info("DRY RUN: The following changes would be applied:")
            for k, v in updates.items():
                logger.info(f"  - Update {k}: {user.__getattribute__(k)} -> {v}")
            
            if target_role == "client" and user.role == "freelancer":
                logger.info("  - DELETE FreelancerPipelineConfig")
                if args.wipe_freelancer_data:
                    logger.warning("  - DELETE ALL Leads, Campaigns, Reports, and Search History")
            
            logger.info("DRY RUN: No changes committed to database.")
            return

        # 5. Apply changes to User
        await session.execute(
            update(User)
            .where(User.id == user.id)
            .values(**updates)
        )

        # 6. Handle Demotion Cleanup (Ensure clients never have freelancer data)
        if target_role == "client":
            logger.info(f"Ensuring {user.email} (as client) has no freelancer configs...")
            await session.execute(
                delete(FreelancerPipelineConfig).where(FreelancerPipelineConfig.user_id == user.id)
            )
            
            if args.wipe_freelancer_data:
                logger.warning(f"Wiping ALL freelancer data (Leads, Campaigns, Reports) for {user.email}...")
                await session.execute(delete(DailyReport).where(DailyReport.user_id == user.id))
                await session.execute(delete(Campaign).where(Campaign.user_id == user.id))
                await session.execute(delete(Lead).where(Lead.user_id == user.id))
                await session.execute(delete(SearchHistory).where(SearchHistory.user_id == user.id))

        # 6. Auto-initialize Freelancer Pipeline Config if promoted to freelancer
        if target_role == "freelancer":
            res = await session.execute(
                select(FreelancerPipelineConfig).where(FreelancerPipelineConfig.user_id == user.id)
            )
            config = res.scalar_one_or_none()
            if not config:
                logger.info(f"Initializing pipeline configuration for {user.email}...")
                new_config = FreelancerPipelineConfig(user_id=user.id, production_status="RUN")
                session.add(new_config)

        await session.commit()
        logger.info(f"✅ Successfully updated user {user.email}!")

def main():
    parser = argparse.ArgumentParser(description="Manage Cold Scout Users")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--id", type=int, help="User ID")
    group.add_argument("--email", type=str, help="User Email")
    group.add_argument("--list", action="store_true", help="List all users and their status")
    
    parser.add_argument("--plan", choices=["free", "pro", "enterprise"], help="Subscription plan")
    parser.add_argument("--role", choices=["client", "freelancer"], help="Access role")
    
    admin_group = parser.add_mutually_exclusive_group()
    admin_group.add_argument("--admin", action="store_true", default=None, help="Grant superuser status")
    admin_group.add_argument("--no-admin", action="store_false", dest="admin", help="Revoke superuser status")

    active_group = parser.add_mutually_exclusive_group()
    active_group.add_argument("--active", action="store_true", default=None, help="Activate account")
    active_group.add_argument("--no-active", action="store_false", dest="active", help="Deactivate account (Login disabled)")
    
    parser.add_argument("--delete", action="store_true", help="Permanently delete user and all data")
    parser.add_argument("--wipe-freelancer-data", action="store_true", help="Wipe all business data when demoting to client")
    parser.add_argument("--force", action="store_true", help="Bypass confirmation prompt for deletion")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without applying them")

    args = parser.parse_args()
    asyncio.run(manage_user(args))

if __name__ == "__main__":
    main()
