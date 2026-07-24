import uuid
from datetime import date, datetime

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
        UniqueConstraint("employee_id", "date", name="uq_attendance_employee_date"),
        Index("ix_attendance_employee_id", "employee_id"),
        Index("ix_attendance_date", "date"),
    )
