"""
Email template rendering module.
Utilizes the Jinja2 templating engine to dynamically generate HTML payloads
for outbound communications, injecting tracking pixels and dynamic content.
"""
import os
from jinja2 import Environment, FileSystemLoader
from typing import Dict, Any
from loguru import logger
from app.config import get_settings

settings = get_settings()

def get_template_env() -> Environment:
    """
    Initializes and returns a Jinja2 Environment configured for the localized template directory.
    
    Returns:
        Environment: The configured Jinja2 templating environment.
    """
    template_dir = os.path.join(os.path.dirname(__file__), "templates")
    os.makedirs(template_dir, exist_ok=True)
    return Environment(loader=FileSystemLoader(template_dir))

import bleach

def render_email_html(lead_data: Dict[str, Any], ai_body_html: str, tracking_token: str, app_url: str) -> str:
    """
    Renders the final HTML email body payload, merging static template structures
    with dynamic LLM-generated content and unique tracking pixels.
    Sanitizes AI-generated content to prevent XSS.
    """
    try:
        # Sanitize AI-generated HTML
        # Allow basic formatting tags but strip scripts/styles
        allowed_tags = [
            'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'span', 'div', 'a', 'b', 'i'
        ]
        allowed_attrs = {
            'a': ['href', 'title', 'target'],
            '*': ['style'] # Some basic styling might be used by LLM
        }
        # In a real scenario, we might want to restrict 'style' more strictly
        sanitized_body = bleach.clean(
            ai_body_html,
            tags=allowed_tags,
            attributes=allowed_attrs,
            strip=True
        )

        env = get_template_env()
        
        template_file = os.path.join(env.loader.searchpath[0], "email_html.j2")
        # Ensure the template exists, but omit the fallback overwrite to preserve our new rich template.
        if not os.path.exists(template_file):
            logger.error("The email_html.j2 template is missing!")
            raise FileNotFoundError("email_html.j2 template missing")
                
        template = env.get_template("email_html.j2")
        
        html_content = template.render(
            business_name=lead_data.get("business_name", "Valued Business"),
            ai_body_html=sanitized_body,
            tracking_token=tracking_token,
            app_url=app_url,
            reply_email=settings.REPLY_TO_EMAIL or settings.FROM_EMAIL,
            logo_url=settings.IMAGE_BASE_URL
        )
        return html_content
    except Exception as e:
        logger.exception("Failed to render email with Jinja2 template")
        return f"<html><body>{ai_body_html}<br><br><p>Best regards</p></body></html>"
