import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, Date, DateTime, Float, Text, JSON, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    employee_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("employees.id"), nullable=False,
    )
    leave_type: Mapped[str] = mapped_column(
        String(50), nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=True)
    # Float, not Integer — a half-day request (see half_day below) stores 0.5
    # here, which is what balance math (sum of .days across approved/pending
    # requests) actually deducts. Every pre-existing whole-day value (1, 2, 5,
    # ...) is already a valid float, so no data migration is needed beyond
    # widening the column type itself.
    days: Mapped[float] = mapped_column(Float, nullable=False, default=1)
    # Null = full day (the existing, only-ever behavior). "First Half"
    # (10:00 AM-2:00 PM) or "Second Half" (3:00 PM-7:00 PM) means only that
    # half is leave — the employee is expected to actually check in for the
    # other half, enforced by AttendanceService shifting that day's marking
    # window to the other half's slot. Only meaningful for a single-day
    # request; LeaveService.create_leave rejects it alongside a real range.
    half_day: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Pending",
    )
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )
    approved_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    rejection_reason: Mapped[str] = mapped_column(Text, nullable=True)
    approval_note: Mapped[str] = mapped_column(Text, nullable=True)
    balance_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True)

    employee = relationship("Employee", lazy="joined", foreign_keys=[employee_id])

    __table_args__ = (
        Index("ix_leave_requests_employee_id", "employee_id"),
        Index("ix_leave_requests_status", "status"),
    )
