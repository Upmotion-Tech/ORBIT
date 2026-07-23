from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class PolicyCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: str = Field(default="General", max_length=100)
    content: Optional[str] = None


class PolicyUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    content: Optional[str] = None


class PolicyResponse(BaseModel):
    id: str
    title: str
    category: str
    content: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    created_by_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v


class PolicyAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


class PolicyAskResponse(BaseModel):
    answer: str
