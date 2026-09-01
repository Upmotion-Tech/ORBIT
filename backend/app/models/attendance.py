import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import String, Date, DateTime, Index, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    # Null = a normal, single full-day record (the only kind that existed
    # before half-day Leave/WFH). "First Half"/"Second Half" means this row
    # covers only that half — a half-day Leave/WFH day can have up to TWO
    # rows for the same (employee_id, date), one per half, each marked (or
    # swept) independently. See AttendanceService._effective_window/
    # mark_attendance for how "now" gets routed to the right half's row.
    half_day: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # "Present" | "Absent" | "WFH" | "Leave"
    # Set only when the employee actually clicked Mark Attendance — null for
    # a row the end-of-day sweep created because nothing was ever marked.
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set only when status == "Leave" — the approved LeaveRequest the
    # end-of-day sweep found for this day, so the UI can show who granted it
    # (LeaveRequest.approved_by_id) without duplicating that data here.
    leave_request_id: Mapped[str] = mapped_column(String(36), ForeignKey("leave_requests.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)

    __table_args__ = (
        # Widened from ("employee_id", "date") to include half_day, so a
        # half-day Leave/WFH day's two rows aren't rejected as duplicates.
        # NOTE: Postgres (and SQLite) treat every NULL as distinct for
        # uniqueness purposes, so this constraint alone doesn't stop two
        # half_day=NULL (normal, full-day) rows for the same employee/date —
        # that guarantee still comes from mark_attendance's own
        # check-before-create (find_by_employee_and_date), same as it always
        # has, not from the DB constraint.
        UniqueConstraint("employee_id", "date", "half_day", name="uq_attendance_employee_date_half"),
        Index("ix_attendance_employee_id", "employee_id"),
        Index("ix_attendance_date", "date"),
    )
