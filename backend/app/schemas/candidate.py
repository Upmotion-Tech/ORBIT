from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class CandidateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    stage: str = Field(default="Applied")
    rating: int = Field(default=0, ge=0, le=5)
    notes: Optional[str] = None


class CandidateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    stage: Optional[str] = None
    rating: Optional[int] = Field(None, ge=0, le=5)
    notes: Optional[str] = None


class CandidateResponse(BaseModel):
    id: str
    opening_id: str
    name: str
    applied_date: Optional[datetime] = None
    resume_url: Optional[str] = None
    rating: int = 0
    stage: str
    notes: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("applied_date", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
