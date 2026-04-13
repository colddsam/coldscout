"""
Threads Discovery Engine.

Searches public Threads posts by configured keywords, extracts user profiles,
and creates ThreadsProfile + ThreadsPost records for qualification.

Key behaviors:
  - Scoped per freelancer: each call processes only the given user's active
    search configs and tags all new profiles with that user_id.
  - Deduplicates posts by threads_media_id globally (each Threads post is
    stored once to prevent multi-reply to the same post).
  - Deduplicates profiles per-user via (user_id, threads_user_id).
  - Respects `is_active` flag on search configs.

SAFE: Only creates new records — never modifies existing leads or pipeline data.
"""
from datetime import datetime, timezone
from loguru import logger
from sqlalchemy import select

from app.config import get_settings
from app.core.database import get_session_maker
from app.models.threads import ThreadsProfile, ThreadsPost, ThreadsSearchConfig
from app.modules.threads.client import ThreadsAPIClient
from app.modules.threads.token_manager import ThreadsTokenManager

settings = get_settings()


async def run_threads_discovery(manual: bool = False, user_id: int | None = None) -> dict:
    """
    Main entry point for the Threads discovery stage for one freelancer.

    Args:
        manual: Accepted for parity with other stages; unused here.
        user_id: Freelancer whose search configs + token are used. Required
            for multi-tenant correctness; None falls back to legacy global.

    Returns:
        Dict with discovery stats (searches_run, posts_found, profiles_created, etc.)
    """
    if not settings.THREADS_ENABLED:
        logger.info("Threads discovery skipped — THREADS_ENABLED is False.")
        return {"status": "disabled"}

    token_mgr = ThreadsTokenManager()
    token = await token_mgr.get_valid_token(user_id=user_id)
    if not token:
        logger.warning(f"Threads discovery skipped — no valid access token (user_id={user_id}).")
        return {"status": "no_token"}

    client = ThreadsAPIClient(access_token=token)
    stats = {
        "searches_run": 0,
        "posts_found": 0,
        "new_posts": 0,
        "new_profiles": 0,
        "skipped_duplicates": 0,
    }

    try:
        async with get_session_maker()() as db:
            configs_stmt = (
                select(ThreadsSearchConfig)
                .where(ThreadsSearchConfig.is_active == True)
            )
            if user_id is not None:
                configs_stmt = configs_stmt.where(ThreadsSearchConfig.user_id == user_id)
            result = await db.execute(configs_stmt)
            configs = result.scalars().all()

            if not configs:
                logger.info(f"No active Threads search configs found (user_id={user_id}).")
                return {"status": "no_configs", **stats}

            for config in configs:
                try:
                    posts = await client.keyword_search(
                        query=config.keyword,
                        search_type=config.search_type,
                        limit=config.max_results_per_search,
                    )
                    stats["searches_run"] += 1
                    stats["posts_found"] += len(posts)

                    for post_data in posts:
                        media_id = post_data.get("id")
                        if not media_id:
                            continue

                        existing_post = await db.execute(
                            select(ThreadsPost).where(
                                ThreadsPost.threads_media_id == str(media_id)
                            )
                        )
                        if existing_post.scalars().first():
                            stats["skipped_duplicates"] += 1
                            continue

                        username = post_data.get("username", "")
                        profile = await _get_or_create_profile(
                            db, client, username, media_id, user_id=user_id
                        )
                        if not profile:
                            continue

                        timestamp_str = post_data.get("timestamp")
                        post_ts = None
                        if timestamp_str:
                            try:
                                post_ts = datetime.fromisoformat(
                                    timestamp_str.replace("Z", "+00:00")
                                )
                            except (ValueError, AttributeError):
                                pass

                        new_post = ThreadsPost(
                            threads_media_id=str(media_id),
                            threads_profile_id=profile.id,
                            text=post_data.get("text", ""),
                            post_type=post_data.get("media_type", "TEXT"),
                            permalink=post_data.get("permalink"),
                            timestamp=post_ts,
                            search_keyword=config.keyword,
                        )
                        db.add(new_post)
                        stats["new_posts"] += 1

                    config.last_searched_at = datetime.now(timezone.utc)

                except Exception as e:
                    logger.error(f"Threads search failed for keyword '{config.keyword}': {e}")
                    continue

            await db.commit()

    except Exception as e:
        logger.exception(f"Threads discovery stage failed: {e}")
        stats["error"] = str(e)
    finally:
        await client.close()

    logger.info(f"Threads discovery complete (user_id={user_id}): {stats}")
    return stats


async def _get_or_create_profile(db, client: ThreadsAPIClient,
                                  username: str, media_id: str,
                                  user_id: int | None = None) -> ThreadsProfile | None:
    """
    Get an existing profile for this freelancer by username, or create one.

    Profile uniqueness is scoped by (user_id, threads_user_id) so two
    freelancers can each independently own their view of the same handle.
    """
    if not username:
        return None

    stmt = select(ThreadsProfile).where(ThreadsProfile.username == username)
    if user_id is not None:
        stmt = stmt.where(ThreadsProfile.user_id == user_id)
    result = await db.execute(stmt)
    existing = result.scalars().first()
    if existing:
        return existing

    try:
        threads_user_id = username  # Fallback: username is the stable visual ID

        stmt2 = select(ThreadsProfile).where(
            ThreadsProfile.threads_user_id == threads_user_id
        )
        if user_id is not None:
            stmt2 = stmt2.where(ThreadsProfile.user_id == user_id)
        result2 = await db.execute(stmt2)
        existing2 = result2.scalars().first()
        if existing2:
            return existing2

        followers = 1  # Search endpoint doesn't expose followers; let AI judge quality.

        new_profile = ThreadsProfile(
            user_id=user_id,
            threads_user_id=threads_user_id,
            username=username,
            name=username,
            bio=None,
            followers_count=followers,
            is_verified=False,
            profile_picture_url=None,
            discovered_via="keyword_search",
        )
        db.add(new_profile)
        await db.flush()

        return new_profile

    except Exception as e:
        logger.warning(f"Failed to fetch profile for @{username}: {e}")
        return None
