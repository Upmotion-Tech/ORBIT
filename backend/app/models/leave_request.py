import uuid
from datetime import datetime, date

from sqlalchemy import String, Date, DateTime, Integer, Text, JSON, Index, ForeignKey
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
    days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
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

    employee = relationship("Employee", lazy="joined")

    __table_args__ = (
        Index("ix_leave_requests_employee_id", "employee_id"),
        Index("ix_leave_requests_status", "status"),
    )
