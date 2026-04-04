"""
WhatsApp Notification Integration Module
=====================================

Dispatches critical, real-time alerts to the administrator's WhatsApp number
when high-intent prospects execute key engagement events.

This module respects the 20 msgs/day rate limit enforced by the CallMeBot API.
"""

import httpx
import logging
from app.config import get_settings

logger = logging.getLogger(__name__)

# In-memory counter to track WhatsApp message count and enforce daily rate limits.
# Note: In a multi-worker setup, this counter may not be perfectly synchronized.
whatsapp_msg_count: int = 0


async def send_whatsapp_alert(message: str) -> bool:
    """
    Transmits an asynchronous alert payload via the CallMeBot API.

    This function is used selectively for "hot-lead" engagements to preserve strict daily provider limits.

    Args:
        message (str): The alert payload to send.

    Returns:
        bool: True if transmission succeeded, False otherwise.
    """
    global whatsapp_msg_count

    # Retrieve application settings.
    settings = get_settings()

    # Extract WhatsApp API credentials.
    phone = settings.WHATSAPP_NUMBER
    apikey = settings.CALLMEBOT_API_KEY

    # Check if WhatsApp API credentials are available.
    if not phone or not apikey:
        logger.warning("WhatsApp API credentials missing. Skipping alert.")
        return False

    # Enforce daily rate limit (20 messages).
    if whatsapp_msg_count >= 20:
        logger.warning("WhatsApp daily limit (20) reached. Skipping alert.")
        return False

    try:
        # Construct API request URL and parameters.
        url = "https://api.callmebot.com/whatsapp.php"
        params = {
            "phone": phone,
            "text": message,
            "apikey": apikey
        }

        # Establish an asynchronous HTTP client session.
        async with httpx.AsyncClient() as client:
            # Send GET request to the WhatsApp API.
            response = await client.get(url, params=params, timeout=10.0)

            # Raise an exception for HTTP errors (4xx or 5xx status codes).
            response.raise_for_status()

        # Increment WhatsApp message count.
        whatsapp_msg_count += 1

        # Indicate successful transmission.
        return True
    except Exception as e:
        # Log transmission failure and return False.
        logger.warning(f"Failed to send WhatsApp alert: {e}")
        return False