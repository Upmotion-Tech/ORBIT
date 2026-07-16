from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class TimeEntryCreate(BaseModel):
    project_id: str = Field(..., max_length=36)
    employee_name: str = Field(..., min_length=1, max_length=255)
    hours: float = Field(..., ge=0)
    week: str = Field(..., min_length=1, max_length=100)


class TimeEntryResponse(BaseModel):
    id: str
    project_id: str
    employee_name: str
    hours: float
    week: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
