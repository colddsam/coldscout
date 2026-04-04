"""
Threads Lead Qualifier.

Uses Groq/Llama AI to score discovered Threads profiles for lead potential.
Analyzes bio text, follower count, post content, and engagement signals
to determine if a profile is a qualified business lead.

Scoring criteria (0-100):
  80-100: High-intent business looking for services (A-tier)
  60-79:  Moderate signals, worth engaging (B-tier)
  40-59:  Weak signals, low priority (C-tier)
  0-39:   Personal account or irrelevant — skip

SAFE: Only updates ThreadsProfile records — never touches the leads table directly.
"""
import json
from loguru import logger
from sqlalchemy import select
from groq import AsyncGroq
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.core.database import get_session_maker
from app.models.threads import ThreadsProfile, ThreadsPost

settings = get_settings()


async def run_threads_qualification() -> dict:
    """
    Main entry point for the Threads qualification stage.

    Processes all profiles with qualification_status='pending' and scores them.
    """
    if not settings.THREADS_ENABLED:
        return {"status": "disabled"}

    stats = {"processed": 0, "qualified": 0, "rejected": 0, "errors": 0}

    async with get_session_maker()() as db:
        stmt = (
            select(ThreadsProfile)
            .where(ThreadsProfile.qualification_status == "pending")
            .limit(50)  # Batch size — avoid LLM overload
        )
        result = await db.execute(stmt)
        pending_profiles = result.scalars().all()

        if not pending_profiles:
            logger.info("No pending Threads profiles to qualify.")
            return {"status": "no_pending", **stats}

        groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)

        for profile in pending_profiles:
            try:
                # Get recent posts for context
                posts_stmt = (
                    select(ThreadsPost)
                    .where(ThreadsPost.threads_profile_id == profile.id)
                    .order_by(ThreadsPost.created_at.desc())
                    .limit(5)
                )
                posts_result = await db.execute(posts_stmt)
                recent_posts = posts_result.scalars().all()

                post_texts = [p.text for p in recent_posts if p.text]

                score, notes = await _score_profile(
                    groq_client, profile, post_texts
                )

                profile.ai_score = score
                profile.qualification_notes = notes

                if score >= 50:
                    profile.qualification_status = "qualified"
                    stats["qualified"] += 1
                else:
                    profile.qualification_status = "rejected"
                    stats["rejected"] += 1

                stats["processed"] += 1

            except Exception as e:
                logger.error(f"Qualification error for @{profile.username}: {e}")
                stats["errors"] += 1
                continue

        await db.commit()

    logger.info(f"Threads qualification complete: {stats}")
    return stats


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def _score_profile(groq_client: AsyncGroq, profile: ThreadsProfile,
                          post_texts: list[str]) -> tuple[int, str]:
    """
    Use Groq/Llama to analyze a Threads profile and assign a lead score.

    Returns:
        Tuple of (score: int 0-100, qualification_notes: str)
    """
    posts_context = "\n".join(
        [f"- {text[:200]}" for text in post_texts[:5]]
    ) if post_texts else "No posts available"

    prompt = f"""
You are a B2B lead qualification expert. Analyze this Threads profile and determine
if this person/business would benefit from web development, digital marketing,
or software services.

Profile:
  - Username: @{profile.username or 'unknown'}
  - Name: {profile.name or 'Not provided'}
  - Bio: {profile.bio or 'No bio'}
  - Followers: {profile.followers_count or 0}
  - Verified: {profile.is_verified}

Recent Posts:
{posts_context}

Score this profile on a scale of 0-100 based on:
1. Business indicators (bio mentions business, services, products)
2. Digital presence need (posts asking about websites, marketing, growth)
3. Engagement quality (follower count relative to content quality)
4. Intent signals (explicit requests for help, recommendations, complaints about tech)

Return ONLY a valid JSON object:
{{
  "score": <0-100>,
  "notes": "<2-3 sentence explanation of the score>",
  "is_business": <true/false>,
  "detected_industry": "<industry or 'unknown'>"
}}
"""
    chat_completion = await groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=settings.GROQ_MODEL,
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    result = json.loads(chat_completion.choices[0].message.content)
    score = min(100, max(0, int(result.get("score", 0))))
    notes = result.get("notes", "No notes provided")

    if result.get("detected_industry"):
        notes += f" | Industry: {result['detected_industry']}"

    return score, notes
