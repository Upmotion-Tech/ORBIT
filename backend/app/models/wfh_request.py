import uuid
from datetime import date, datetime

from sqlalchemy import String, Date, DateTime, Text, Index, UniqueConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class WfhRequest(Base):
    __tablename__ = "wfh_requests"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")  # Pending/Approved/Rejected
    decision_note: Mapped[str] = mapped_column(Text, nullable=True)
    decided_by: Mapped[str] = mapped_column(String(255), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)

    __table_args__ = (
        # One request per employee per day — a rejected request means
        # picking a different day, not resubmitting the same one.
        UniqueConstraint("employee_id", "date", name="uq_wfh_employee_date"),
        Index("ix_wfh_employee_id", "employee_id"),
        Index("ix_wfh_status", "status"),
    )
