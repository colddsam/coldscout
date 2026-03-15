"""
Asynchronous email dispatch module.
Transmits structured HTML communications and attachments via SMTP.
"""
from loguru import logger
import aiosmtplib
from email.message import EmailMessage
import os
from email.utils import formataddr
from app.config import get_settings
settings = get_settings()

async def send_email(to_email: str, subject: str, html_content: str, attachment_paths: list[str] = None) -> bool:
    """
    Transmits an asynchronous email utilizing the configured SMTP relay service.
    """
    message = EmailMessage()
    message["From"] = formataddr((settings.FROM_NAME, settings.FROM_EMAIL))
    message["To"] = to_email
    message["Subject"] = subject
    if settings.REPLY_TO_EMAIL:
        message["Reply-To"] = settings.REPLY_TO_EMAIL

    message.set_content("Please enable HTML to view this message.")
    message.add_alternative(html_content, subtype='html')

    if attachment_paths:
        for filepath in attachment_paths:
            if os.path.exists(filepath):
                with open(filepath, 'rb') as f:
                    file_data = f.read()
                    file_name = os.path.basename(filepath)
                message.add_attachment(file_data, maintype='application', subtype='pdf', filename=file_name)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.BREVO_SMTP_HOST,
            port=settings.BREVO_SMTP_PORT,
            username=settings.BREVO_SMTP_USER,
            password=settings.BREVO_SMTP_PASSWORD,
            use_tls=True if settings.BREVO_SMTP_PORT == 465 else False,
            start_tls=True if settings.BREVO_SMTP_PORT == 587 else False,
        )
        return True
    except Exception as e:
        logger.exception(f"Failed to send email to {to_email}")
        return False
