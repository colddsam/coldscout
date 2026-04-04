from datetime import datetime
import uuid
from sqlalchemy import Column, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.models import Base

class PromptConfig(Base):
    """
    Stores different prompt variations for A/B testing and optimization.
    """
    __tablename__ = "prompt_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prompt_type = Column(String(50), nullable=False, index=True) # e.g., "initial_outreach", "followup_1"
    prompt_text = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    performance_score = Column(String(50), nullable=True) # Could be JSON or string representation of win rate
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
