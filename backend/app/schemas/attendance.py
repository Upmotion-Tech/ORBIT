from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.core.time import to_pkt


class AttendanceResponse(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_department: Optional[str] = None
    date: date
    status: str
    marked_at: Optional[datetime] = None
    # Populated only when status == "Leave" — who approved the leave that
    # covers this day, so the employee and Owner/HR can both see it without
    # a separate lookup.
    leave_approved_by_name: Optional[str] = None
    leave_type: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("marked_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v


class TodayAttendanceRow(BaseModel):
    employee_id: str
    employee_name: str
    employee_department: str
    status: str  # "Present" | "Absent" | "Not Marked Yet"
    marked_at: Optional[datetime] = None

    @field_validator("marked_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
