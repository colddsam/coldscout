"""
Asynchronous Email Dispatch Module.

Transmits structured HTML outreach communications via an SMTP relay (Brevo).
Supports optional file attachments and implements automatic retry logic for
transient SMTP connection failures.

Security notes:
  - Attachment paths are validated against an allowed directory before being
    opened to prevent path traversal attacks.
  - SMTP credentials are sourced exclusively from the application settings
    (environment variables); they are never passed as function arguments.
"""

import os
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path

import aiosmtplib
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# Attachment security: restrict all attachments to this directory.
# Any path that resolves outside this root is rejected before the file is
# opened, preventing directory traversal exploitation.
# ---------------------------------------------------------------------------
_ALLOWED_ATTACHMENT_DIR = Path(settings.ATTACHMENT_DIR).resolve()

_ALLOWED_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".csv", ".txt"}


def _safe_attachment_path(filepath: str) -> Path:
    """
    Resolves and validates an attachment file path.

    Ensures the resolved path:
    1. Falls within the configured allowed attachment directory.
    2. Has an extension from the approved whitelist.

    Args:
        filepath: The raw attachment path string supplied by internal code.

    Returns:
        Path: The resolved, validated :class:`pathlib.Path` object.

    Raises:
        ValueError: If the path escapes the allowed directory or has a
                    disallowed file extension.
    """
    resolved = Path(filepath).resolve()

    # Guard against directory traversal (e.g. "../../etc/passwd")
    if not str(resolved).startswith(str(_ALLOWED_ATTACHMENT_DIR)):
        raise ValueError(
            f"Attachment path '{filepath}' is outside the allowed directory "
            f"'{_ALLOWED_ATTACHMENT_DIR}'."
        )

    # Whitelist-only extension check
    if resolved.suffix.lower() not in _ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Attachment extension '{resolved.suffix}' is not permitted. "
            f"Allowed: {_ALLOWED_EXTENSIONS}"
        )

    return resolved


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    attachment_paths: list[str] = None,
) -> bool:
    """
    Transmits an HTML email via the configured SMTP relay (Brevo).

    Automatically retries up to three times on transient SMTP failures using
    exponential back-off (2 s → 4 s → 10 s).

    Args:
        to_email:         Recipient email address.
        subject:          Email subject line.
        html_content:     HTML body of the email.
        attachment_paths: Optional list of absolute file paths to attach.
                          Each path is validated against the allowed directory
                          before being opened (see ``_safe_attachment_path``).

    Returns:
        bool: True on successful delivery.

    Raises:
        Exception: Re-raised on final SMTP failure so Tenacity can record it.
    """
    message = EmailMessage()
    message["From"] = formataddr((settings.FROM_NAME, settings.FROM_EMAIL))
    message["To"] = to_email
    message["Subject"] = subject
    if settings.REPLY_TO_EMAIL:
        message["Reply-To"] = settings.REPLY_TO_EMAIL

    # Plain-text fallback for clients that do not render HTML
    message.set_content("Please enable HTML to view this message.")
    message.add_alternative(html_content, subtype="html")

    if attachment_paths:
        for filepath in attachment_paths:
            try:
                safe_path = _safe_attachment_path(filepath)
            except ValueError as exc:
                # Log the violation and skip — do not abort the entire send.
                logger.warning("Skipping unsafe attachment path: %s", exc)
                continue

            if not safe_path.exists():
                logger.warning("Attachment not found, skipping: %s", safe_path)
                continue

            with open(safe_path, "rb") as f:
                file_data = f.read()

            file_name = safe_path.name
            suffix = safe_path.suffix.lower()

            # Map extension to MIME subtype
            subtype_map = {
                ".xlsx": "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ".xls": "vnd.ms-excel",
                ".csv": "csv",
                ".txt": "plain",
            }
            subtype = subtype_map.get(suffix, "pdf")

            message.add_attachment(
                file_data,
                maintype="application",
                subtype=subtype,
                filename=file_name,
            )

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.BREVO_SMTP_HOST,
            port=settings.BREVO_SMTP_PORT,
            username=settings.BREVO_SMTP_USER,
            password=settings.BREVO_SMTP_PASSWORD,
            use_tls=settings.BREVO_SMTP_PORT == 465,
            start_tls=settings.BREVO_SMTP_PORT == 587,
        )
        return True
    except Exception as e:
        logger.error("Failed to send email to %s after retries: %s", to_email, e)
        raise e  # Tenacity needs the exception to decide whether to retry
