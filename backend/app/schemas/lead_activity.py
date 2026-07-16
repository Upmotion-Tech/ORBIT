from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class ActivityCreate(BaseModel):
    type: str = Field(default="comment", max_length=50)
    note: Optional[str] = None


class ActivityResponse(BaseModel):
    id: str
    lead_id: str
    type: str
    note: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v


class ActivityListResponse(BaseModel):
    items: list[ActivityResponse]
    total: int
