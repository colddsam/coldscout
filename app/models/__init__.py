from app.models.base import Base

# Import all models here so they get registered with Base
from app.models.lead import Lead
from app.models.campaign import Campaign, EmailOutreach
from app.models.email_event import EmailEvent
from app.models.daily_report import DailyReport
from app.models.prompt_config import PromptConfig
from app.models.user import User
from app.models.threads import (
    ThreadsProfile, ThreadsPost, ThreadsEngagement,
    ThreadsSearchConfig, ThreadsAuth,
)
