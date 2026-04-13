"""
Threads Engagement Engine.

Generates AI-crafted replies and publishes them to qualified leads' posts.
Implements anti-spam safeguards via the RateLimiter and LLM self-review.

Engagement flow:
  1. Pick qualified profiles with unengaged posts
  2. Generate a contextual reply via Groq/Llama
  3. Self-review the reply for spam/tone quality
  4. Publish via the Threads API
  5. Record engagement in the database

SAFE: Only creates new ThreadsEngagement records and publishes via API.
"""
import json
from datetime import datetime, timezone
from loguru import logger
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from groq import AsyncGroq
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.core.database import get_session_maker
from app.models.threads import ThreadsProfile, ThreadsPost, ThreadsEngagement
from app.modules.threads.client import ThreadsAPIClient
from app.modules.threads.token_manager import ThreadsTokenManager
from app.modules.threads.rate_limiter import ThreadsRateLimiter

settings = get_settings()


async def run_threads_engagement(manual: bool = False, user_id: int | None = None) -> dict:
    """
    Main entry point for the Threads engagement stage for one freelancer.

    Finds qualified profiles with unengaged posts, generates replies,
    and publishes them while respecting rate limits and anti-spam rules.
    All queries and the OAuth token are scoped to ``user_id`` when given.
    """
    if not settings.THREADS_ENABLED:
        return {"status": "disabled"}

    rate_limiter = ThreadsRateLimiter()
    token_mgr = ThreadsTokenManager()
    token = await token_mgr.get_valid_token(user_id=user_id)

    if not token:
        logger.warning("Threads engagement skipped — no valid access token.")
        return {"status": "no_token"}

    client = ThreadsAPIClient(access_token=token)
    groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    stats = {"considered": 0, "sent": 0, "rate_limited": 0, "failed": 0}

    try:
        async with get_session_maker()() as db:
            # Find qualified profiles with unengaged posts
            stmt = (
                select(ThreadsProfile)
                .where(ThreadsProfile.qualification_status == "qualified")
                .options(selectinload(ThreadsProfile.posts))
            )
            if user_id is not None:
                stmt = stmt.where(ThreadsProfile.user_id == user_id)
            stmt = stmt.limit(30)
            result = await db.execute(stmt)
            profiles = result.scalars().unique().all()

            for profile in profiles:
                # Find posts that haven't been engaged yet
                for post in profile.posts:
                    # Check if this post already has an engagement
                    engaged_stmt = select(ThreadsEngagement).where(
                        ThreadsEngagement.threads_post_id == post.id
                    )
                    eng_result = await db.execute(engaged_stmt)
                    if eng_result.scalars().first():
                        continue  # Already engaged this post

                    stats["considered"] += 1

                    # Rate limit check (per-freelancer cap + cooldown)
                    allowed, reason = await rate_limiter.can_send_reply(
                        threads_profile_id=str(profile.id),
                        user_id=user_id,
                    )
                    if not allowed:
                        logger.info(f"Rate limited: {reason}")
                        stats["rate_limited"] += 1
                        continue

                    try:
                        # Generate reply
                        reply_text = await _generate_reply(
                            groq_client, profile, post
                        )
                        if not reply_text:
                            continue

                        # Self-review for quality/spam
                        is_safe = await _self_review_reply(groq_client, reply_text, post.text or "")
                        if not is_safe:
                            logger.warning(f"Reply failed self-review for post {post.threads_media_id}")
                            continue

                        # Publish reply via API
                        publish_result = await client.create_reply(
                            reply_to_media_id=post.threads_media_id,
                            text=reply_text,
                        )

                        # Record engagement
                        engagement = ThreadsEngagement(
                            user_id=user_id,
                            threads_profile_id=profile.id,
                            threads_post_id=post.id,
                            reply_threads_media_id=str(publish_result.get("id", "")),
                            reply_text=reply_text,
                            engagement_type="reply",
                            status="sent",
                            ai_generated=True,
                            replied_at=datetime.now(timezone.utc),
                        )
                        db.add(engagement)

                        # Update profile status
                        profile.qualification_status = "engaged"
                        stats["sent"] += 1

                        logger.info(
                            f"✅ Reply sent to @{profile.username} on post {post.threads_media_id}"
                        )

                        # Only engage one post per profile per run
                        break

                    except Exception as e:
                        logger.error(f"Failed to engage @{profile.username}: {e}")
                        stats["failed"] += 1

                        # Record failed engagement for tracking
                        engagement = ThreadsEngagement(
                            user_id=user_id,
                            threads_profile_id=profile.id,
                            threads_post_id=post.id,
                            reply_text=reply_text if 'reply_text' in dir() else "generation_failed",
                            engagement_type="reply",
                            status="failed",
                            ai_generated=True,
                        )
                        db.add(engagement)
                        break

            await db.commit()

    except Exception as e:
        logger.exception(f"Threads engagement stage failed: {e}")
        stats["error"] = str(e)
    finally:
        await client.close()

    logger.info(f"Threads engagement complete: {stats}")
    return stats


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def _generate_reply(groq_client: AsyncGroq, profile: ThreadsProfile,
                           post: ThreadsPost) -> str | None:
    """
    Generate a contextual, non-spammy reply using Groq/Llama.
    The reply should feel organic, helpful, and conversational.
    """
    prompt = f"""
You are a friendly web developer/digital consultant engaging naturally on social media.
Write a helpful, conversational reply to this Threads post.

About the poster:
  - Username: @{profile.username or 'user'}
  - Bio: {profile.bio or 'No bio available'}
  - Industry context: {profile.qualification_notes or 'Unknown'}

Their post:
"{post.text or 'No text'}"

Requirements:
  1. Keep it SHORT (1-3 sentences max, under 280 characters)
  2. Be genuinely helpful — offer a specific tip or insight
  3. Sound natural and conversational, NOT salesy or robotic
  4. Do NOT directly pitch services or link to websites
  5. Do NOT use hashtags or emojis excessively (1-2 max)
  6. If the post is about needing a website/digital help, offer a relevant tip
  7. End with a soft question to encourage dialogue

Return ONLY a JSON object:
{{
  "reply": "<your reply text>",
  "confidence": <0.0-1.0>
}}
"""
    chat_completion = await groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=settings.GROQ_MODEL,
        response_format={"type": "json_object"},
        temperature=0.7,
    )

    result = json.loads(chat_completion.choices[0].message.content)
    reply = result.get("reply", "").strip()
    confidence = float(result.get("confidence", 0))

    if confidence < 0.5 or len(reply) < 10:
        logger.warning(f"Low-confidence reply skipped ({confidence}): {reply[:50]}...")
        return None

    return reply


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=8))
async def _self_review_reply(groq_client: AsyncGroq, reply: str,
                              original_post: str) -> bool:
    """
    LLM self-review: checks if the reply sounds spammy, promotional, or inappropriate.
    Returns True if the reply passes quality check, False otherwise.
    """
    prompt = f"""
You are a content quality reviewer. Evaluate this social media reply for quality.

Original post: "{original_post[:300]}"
Proposed reply: "{reply}"

Check for:
1. Spammy or overly promotional language
2. Unnatural or robotic tone
3. Inappropriate content
4. Comes across as automated/bot-like
5. Too salesy (pushing services/products)

Return ONLY a JSON object:
{{
  "is_safe": true/false,
  "reason": "<brief explanation>"
}}
"""
    chat_completion = await groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=settings.GROQ_MODEL,
        response_format={"type": "json_object"},
        temperature=0.1,
    )

    result = json.loads(chat_completion.choices[0].message.content)
    is_safe = result.get("is_safe", False)

    if not is_safe:
        logger.info(f"Self-review rejected reply: {result.get('reason', 'unknown')}")

    return is_safe


async def check_engagement_responses(manual: bool = False, user_id: int | None = None) -> dict:
    """
    Monitor one freelancer's sent engagements for responses from leads.
    Updates engagement status to 'replied_back' when a response is detected.
    """
    if not settings.THREADS_ENABLED:
        return {"status": "disabled"}

    token_mgr = ThreadsTokenManager()
    token = await token_mgr.get_valid_token(user_id=user_id)
    if not token:
        return {"status": "no_token"}

    client = ThreadsAPIClient(access_token=token)
    stats = {"checked": 0, "responses_found": 0}

    try:
        async with get_session_maker()() as db:
            stmt = (
                select(ThreadsEngagement)
                .where(ThreadsEngagement.status == "sent")
                .where(ThreadsEngagement.reply_threads_media_id.isnot(None))
            )
            if user_id is not None:
                stmt = stmt.where(ThreadsEngagement.user_id == user_id)
            stmt = stmt.limit(50)
            result = await db.execute(stmt)
            sent_engagements = result.scalars().all()

            for engagement in sent_engagements:
                try:
                    replies = await client.get_post_replies(
                        engagement.reply_threads_media_id
                    )
                    stats["checked"] += 1

                    for reply in replies:
                        # Check if this reply is from someone else (not our account)
                        reply_username = reply.get("username", "")
                        if reply_username and reply.get("text"):
                            engagement.status = "replied_back"
                            engagement.response_text = reply.get("text", "")[:1000]
                            engagement.response_received_at = datetime.now(timezone.utc)
                            stats["responses_found"] += 1
                            break  # One response is enough

                except Exception as e:
                    logger.warning(f"Failed to check replies for {engagement.reply_threads_media_id}: {e}")

            await db.commit()

    except Exception as e:
        logger.exception(f"Engagement response check failed: {e}")
    finally:
        await client.close()

    logger.info(f"Engagement response check: {stats}")
    return stats
