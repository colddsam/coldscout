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

def render_email_html(lead_data: Dict[str, Any], ai_body_html: str, tracking_token: str, app_url: str) -> str:
    """
    Renders the final HTML email body payload, merging static template structures
    with dynamic LLM-generated content and unique tracking pixels.
    
    Args:
        lead_data (Dict[str, Any]): Dictionary containing foundational lead attributes.
        ai_body_html (str): The pre-generated HTML body content from the LLM.
        tracking_token (str): The uniquely generated token for tracking engagement metrics.
        app_url (str): The base URL of the application to facilitate pixel tracking.
        
    Returns:
        str: The fully rendered HTML document string.
    """
    try:
        env = get_template_env()
        
        template_file = os.path.join(env.loader.searchpath[0], "email_html.j2")
        # Ensure the template exists, but omit the fallback overwrite to preserve our new rich template.
        if not os.path.exists(template_file):
            logger.error("The email_html.j2 template is missing!")
            raise FileNotFoundError("email_html.j2 template missing")
                
        template = env.get_template("email_html.j2")
        
        html_content = template.render(
            business_name=lead_data.get("business_name", "Valued Business"),
            ai_body_html=ai_body_html,
            tracking_token=tracking_token,
            app_url=app_url,
            reply_email=settings.REPLY_TO_EMAIL or settings.FROM_EMAIL,
            logo_url=settings.IMAGE_BASE_URL
        )
        return html_content
    except Exception as e:
        logger.exception("Failed to render email with Jinja2 template")
        return f"<html><body>{ai_body_html}<br><br><p>Best regards</p></body></html>"
