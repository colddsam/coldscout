"""
Performance analytics and autonomous optimization module.
Aggregates weekly campaign performance metrics and utilizes LLM feedback 
loops to autonomously refine outreach prompt configurations.
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger
from datetime import datetime, timedelta, timezone

from app.models.lead import Lead
from app.models.campaign import Campaign, EmailOutreach
from app.models.prompt_config import PromptConfig
from app.modules.personalization.groq_client import GroqClient

async def _run_weekly_optimization_core(db: AsyncSession):
    """
    Cron-triggered performance analyzer. Evaluates the previous week's aggregate 
    email metrics (open, click, and reply rates). If reply rates fall below target 
    thresholds, dynamically requests the LLM to synthesize refined prompt templates,
    deprecating underperforming configurations while deploying the new iteration.
    """
    logger.info("Starting Weekly Optimization Engine...")
    
    one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    
    # 1. Analyze campaign stats
    stmt = select(func.sum(Campaign.emails_sent), func.sum(Campaign.emails_opened), 
                  func.sum(Campaign.links_clicked), func.sum(Campaign.replies_received)) \
           .where(Campaign.campaign_date >= one_week_ago.date())
           
    res = await db.execute(stmt)
    sent, opened, clicked, replies = res.first()
    
    sent = sent or 0
    opened = opened or 0
    clicked = clicked or 0
    replies = replies or 0
    
    open_rate = (opened / sent * 100) if sent > 0 else 0
    reply_rate = (replies / sent * 100) if sent > 0 else 0
    
    logger.info(f"Weekly Stats Summary: Sent={sent}, Open Rate={open_rate:.2f}%, Reply Rate={reply_rate:.2f}%")
    
    if sent == 0:
        logger.info("Not enough data for weekly optimization.")
        return
        
    # 2. Get active active prompts
    stmt = select(PromptConfig).where(PromptConfig.is_active == True)
    res = await db.execute(stmt)
    active_prompts = res.scalars().all()
    
    if not active_prompts:
        logger.info("No DB prompts configured. Skipping prompt optimization.")
        return

    # 3. Use LLM to suggest improvements if performance is low
    if reply_rate < 5.0:
        groq_client = GroqClient()
        for prompt in active_prompts:
            if prompt.prompt_type == "initial_outreach":
                logger.info("Reply rate is below 5%. Asking Groq for prompt optimization.")
                
                analysis_prompt = f"""
We sent {sent} emails this week using the following prompt generation logic, 
and only got a {reply_rate:.2f}% reply rate. 

Current Prompt Template:
{prompt.prompt_text}

Can you rewrite this prompt template to be more engaging, concise, and generate higher replies?
Keep the same placeholder variables: {{business_name}}, {{category}}, {{location}}, {{rating}}, {{review_count}}, {{web_presence_notes}}, {{website_title}}, {{website_services}}, {{website_year}}, {{competitor_name}}.
Return ONLY the new prompt text.
"""
                try:
                    chat_completion = await groq_client.client.chat.completions.create(
                        messages=[{"role": "user", "content": analysis_prompt}],
                        model=groq_client.model,
                        temperature=0.8
                    )
                    new_text = chat_completion.choices[0].message.content.strip()
                    
                    # Store old performance and deactivate it
                    prompt.is_active = False
                    prompt.performance_score = f"Sent: {sent}, Reply Rate: {reply_rate:.2f}%"
                    
                    # Create new optimized prompt
                    new_prompt = PromptConfig(
                        prompt_type="initial_outreach",
                        prompt_text=new_text,
                        is_active=True
                    )
                    db.add(new_prompt)
                    await db.commit()
                    logger.info("Successfully generated and activated a new optimized prompt.")
                except Exception as e:
                    logger.error(f"Error optimizing prompt: {e}")
                    await db.rollback()

async def run_weekly_optimization(manual: bool = False):
    """
    Wrapper function for APScheduler to run without arguments.
    Acquires its own database session and calls the core logic.
    """
    from app.core.job_manager import job_manager
    if not job_manager.is_job_active("weekly_optimization", ignore_global_hold=manual):
        logger.warning("🚨 [weekly_optimization] is HOLD. Skipping optimization.")
        return

    from app.core.database import get_session_maker
    async_session = get_session_maker()
    try:
        async with async_session() as db:
            await _run_weekly_optimization_core(db)
    except Exception as e:
        logger.exception(f"Weekly optimization failed: {e}")
        try:
            from app.modules.notifications.telegram_bot import send_telegram_alert
            await send_telegram_alert(f"Weekly optimization failed: {e}")
        except Exception:
            logger.error("Failed to send Telegram alert for optimization failure")
