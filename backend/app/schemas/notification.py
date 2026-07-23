from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class NotificationReadUpdate(BaseModel):
    is_read: bool


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str
    title: str
    message: str
    is_read: bool
    related_type: Optional[str] = None
    related_id: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
