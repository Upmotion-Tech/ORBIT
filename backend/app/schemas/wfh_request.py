from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class WfhRequestCreate(BaseModel):
    date: date
    # Optional — omitted/null means a single-day request, matching how the
    # Leave form's own "End date (optional)" already behaves.
    end_date: Optional[date] = None
    description: Optional[str] = None


class WfhRequestUpdate(BaseModel):
    """Self-service edit of one's own still-Pending request. The owner comes
    from the caller's token, never the body — a request can't be reassigned."""
    date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None


class WfhDecision(BaseModel):
    note: Optional[str] = Field(None, max_length=1000)


class WfhRequestResponse(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_department: Optional[str] = None
    date: date
    end_date: Optional[date] = None
    days: int = 1
    description: Optional[str] = None
    status: str
    decision_note: Optional[str] = None
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("decided_at", "created_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
