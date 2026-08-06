from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class LeaveCreate(BaseModel):
    employee_id: str = Field(..., max_length=36)
    leave_type: str = Field(..., max_length=50)
    start_date: date
    end_date: Optional[date] = None
    reason: Optional[str] = None


class LeaveUpdate(BaseModel):
    """Self-service edit of one's own still-Pending request. employee_id is
    deliberately absent — a request can never be reassigned to someone else,
    and the owner is taken from the caller's token, not the body."""
    leave_type: Optional[str] = Field(None, max_length=50)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    reason: Optional[str] = None


class LeaveApproval(BaseModel):
    note: Optional[str] = None
    rejection_reason: Optional[str] = None


class LeaveResponse(BaseModel):
    id: str
    employee_id: str
    leave_type: str
    start_date: date
    end_date: Optional[date] = None
    days: int
    reason: Optional[str] = None
    status: str
    applied_at: Optional[datetime] = None
    approved_by_id: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    approval_note: Optional[str] = None
    balance_snapshot: Optional[dict] = None
    employee_name: Optional[str] = None
    employee_department: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("applied_at", "approved_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v


class LeaveBalanceResponse(BaseModel):
    employee_id: str
    casual_used: int = 0
    casual_pending: int = 0
    casual_remaining: int = 0
    sick_used: int = 0
    sick_pending: int = 0
    sick_remaining: int = 0
    annual_used: int = 0
    annual_pending: int = 0
    annual_remaining: int = 0
    total_used: int = 0
    total_pending: int = 0
    total_remaining: int = 0
