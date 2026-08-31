from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class LeaveCreate(BaseModel):
    employee_id: str = Field(..., max_length=36)
    leave_type: str = Field(..., max_length=50)
    start_date: date
    end_date: Optional[date] = None
    # "First Half" / "Second Half" / omitted (full day). Only valid alongside
    # a single day (no end_date, or end_date == start_date) — LeaveService
    # rejects it paired with a real range.
    half_day: Optional[str] = None
    reason: Optional[str] = None


class LeaveUpdate(BaseModel):
    """Self-service edit of one's own still-Pending request. employee_id is
    deliberately absent — a request can never be reassigned to someone else,
    and the owner is taken from the caller's token, not the body."""
    leave_type: Optional[str] = Field(None, max_length=50)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    half_day: Optional[str] = None
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
    days: float
    half_day: Optional[str] = None
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
    # Float, not int — a half-day request contributes 0.5 to *_used/pending,
    # which then also makes *_remaining potentially fractional.
    employee_id: str
    casual_used: float = 0
    casual_pending: float = 0
    casual_remaining: float = 0
    sick_used: float = 0
    sick_pending: float = 0
    sick_remaining: float = 0
    annual_used: float = 0
    annual_pending: float = 0
    annual_remaining: float = 0
    total_used: float = 0
    total_pending: float = 0
    total_remaining: float = 0
