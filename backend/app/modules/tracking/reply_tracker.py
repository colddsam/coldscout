"""
Inbound reply tracking module.
Establishes secure IMAP connections to monitor configured mailboxes for
direct responses from generated leads.
"""
import imaplib
import email
from email.header import decode_header
from typing import List, Tuple
from app.config import get_settings
settings = get_settings()
import logging
from datetime import datetime, timezone
import email.utils

logger = logging.getLogger(__name__)

async def fetch_recent_replies(since_minutes: int = 30) -> List[Tuple[str, str, datetime]]:
    """
    Connects to the designated IMAP server to retrieve recent, unseen email communications.
    Parses the sender and subject headers for subsequent processing and lead matching.
    
    Args:
        since_minutes (int, optional): The time window in minutes to bound the search. Defaults to 30.
        
    Returns:
        List[Tuple[str, str]]: A list of tuples containing the extracted sender email and subject string.
    """
    if not settings.IMAP_USER or not settings.IMAP_PASSWORD:
        logger.warning("IMAP credentials not set, skipping reply polling.")
        return []

    try:
        mail = imaplib.IMAP4_SSL(settings.IMAP_HOST)
        mail.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        mail.select("inbox")
        
        status, messages = mail.search(None, "UNSEEN")
        if status != "OK":
            mail.logout()
            return []
            
        email_ids = messages[0].split()
        results = []
        
        for e_id in email_ids[-50:]:
            status, msg_data = mail.fetch(e_id, "(RFC822)")
            if status != "OK":
                continue
                
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    
                    try:
                        raw_subject = msg.get("Subject", "")
                        subject, encoding = decode_header(raw_subject)[0]
                        if isinstance(subject, bytes):
                            subject = subject.decode(encoding or "utf-8", errors="replace")
                    except (UnicodeDecodeError, LookupError, TypeError):
                        subject = str(msg.get("Subject", "(no subject)"))
                        
                    sender = msg.get("From", "")
                    if not sender:
                        continue
                        
                    if "<" in sender and ">" in sender:
                        sender = sender.split("<")[1].split(">")[0]
                        
                    date_str = msg.get("Date")
                    try:
                        reply_time = email.utils.parsedate_to_datetime(date_str).replace(tzinfo=None)
                    except (TypeError, ValueError, AttributeError):
                        reply_time = datetime.now(timezone.utc)
                        
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            if part.get_content_type() == "text/plain":
                                try:
                                    payload = part.get_payload(decode=True)
                                    if payload:
                                        body = payload.decode(errors="replace")
                                    break
                                except (UnicodeDecodeError, AttributeError, LookupError):
                                    pass
                    else:
                        try:
                            payload = msg.get_payload(decode=True)
                            if payload:
                                body = payload.decode(errors="replace")
                        except (UnicodeDecodeError, AttributeError, LookupError):
                            pass
                            
                    if sender:
                        results.append((sender.lower().strip(), subject, reply_time, body))
        
        mail.logout()
        return results

    except Exception as e:
        logger.error(f"Error checking replies via IMAP: {e}")
        return []
    finally:
        try:
            if 'mail' in locals() and mail:
                mail.logout()
        except (imaplib.IMAP4.error, OSError):
            pass
