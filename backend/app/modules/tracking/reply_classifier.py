"""
Reply intelligence module.
Leverages LLMs to autonomously parse, classify, and draft responses for incoming 
prospect replies based on predefined interaction taxonomy.
"""
import json
from loguru import logger
from app.modules.personalization.groq_client import GroqClient
from app.models.lead import Lead

REPLY_CATEGORIES = ["interested", "not_interested", "auto_reply", "wrong_person", "question", "pricing_inquiry"]

async def classify_reply(email_body: str, email_subject: str) -> dict:
    """
    Classifies a prospect's email reply into a structured intent category.
    
    Returns:
        dict: Contains 'classification', 'confidence', and a 'key_signal' quote.
    """
    prompt = f"""
Analyze this email reply from a lead and classify it into exactly one of these categories:
{REPLY_CATEGORIES}

Subject: {email_subject}
Body: {email_body}

Respond ONLY with a valid JSON object:
{{
  "classification": "...",
  "confidence": 0.95,
  "key_signal": "Short quote from the email that justifies the classification"
}}
"""
    try:
        groq_client = GroqClient()
        chat_completion = await groq_client.client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=groq_client.model,
            response_format={"type": "json_object"},
            temperature=0.0
        )
        return json.loads(chat_completion.choices[0].message.content)
    except Exception as e:
        logger.error(f"Error classifying reply: {e}")
        return {"classification": "question", "confidence": 0.5, "key_signal": "parsing failed"}

async def draft_reply_response(lead: Lead, original_reply_body: str, classification: str) -> str:
    """
    Generates a context-aware HTML draft response based on the reply classification.
    The response is stored in the database for manual review and approval prior to sending.
    """
    prompt = f"""
A lead has replied to our outreach email. They are classified as '{classification}'.
Please draft a professional, helpful, and concise response. 

Lead Business: {lead.business_name}
Lead Email Body:
{original_reply_body}

Write the response in HTML format using <p> tags. Be warm and try to move them toward a phone call or meeting.
Do not include subject line, just the body HTML. Output ONLY valid JSON:
{{
  "draft_html": "<p>...</p>"
}}
"""
    try:
        groq_client = GroqClient()
        chat_completion = await groq_client.client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=groq_client.model,
            response_format={"type": "json_object"},
            temperature=0.5
        )
        res = json.loads(chat_completion.choices[0].message.content)
        return res.get("draft_html", "")
    except Exception as e:
        logger.error(f"Error drafting reply: {e}")
        return "<p>Thank you for your reply. Let's schedule a time to chat!</p>"
