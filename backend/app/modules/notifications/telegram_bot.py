"""
Telegram Bot notification module.

This module facilitates system-wide alerting capabilities by interfacing with the Telegram Bot API for administrative tracking.
"""

import httpx
from app.config import get_settings
settings = get_settings()
import logging

logger = logging.getLogger(__name__)

async def send_telegram_alert(message: str) -> bool:
    """
    Sends an arbitrary textual payload to the securely configured Telegram administrative channel.

    Args:
        message (str): The structured alert message to dispatch.

    Returns:
        bool: True if the dispatch was successfully processed, False otherwise.
    """
    # Check if Telegram credentials are set
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        # Log a warning if credentials are missing
        logger.warning("Telegram credentials not set. Alert skipped.")
        return False

    # Construct the Telegram API URL
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"

    # Define the payload for the Telegram API request
    payload = {
        "chat_id": settings.TELEGRAM_CHAT_ID,
        "text": message
    }

    try:
        # Create an asynchronous HTTP client
        async with httpx.AsyncClient() as client:
            # Send a POST request to the Telegram API
            response = await client.post(url, json=payload, timeout=5.0)

            # Check if the response was successful
            if response.status_code == 200:
                return True
            else:
                # Log an error if the response was not successful
                logger.error(f"Failed to send Telegram alert: {response.text}")
                return False
    except Exception as e:
        # Log an error if an exception occurred
        logger.error(f"Telegram API Exception: {e}")
        return False