from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class OpeningCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    department: str = Field(..., min_length=1, max_length=255)
    status: str = Field(default="Open")
    salary_bracket: Optional[str] = Field(None, max_length=255)
    experience: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None


class OpeningUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    department: Optional[str] = Field(None, min_length=1, max_length=255)
    status: Optional[str] = None
    salary_bracket: Optional[str] = Field(None, max_length=255)
    experience: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None


class OpeningResponse(BaseModel):
    id: str
    title: str
    department: str
    status: str
    salary_bracket: Optional[str] = None
    experience: Optional[str] = None
    description: Optional[str] = None
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    created_by: Optional[str] = None
    candidate_count: int = 0

    model_config = {"from_attributes": True}

    @field_validator("opened_at", "closed_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
