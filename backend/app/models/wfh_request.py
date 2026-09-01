import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import String, Date, DateTime, Text, Index, ForeignKey
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
    # Null means a single-day request (the WFH day is just `date`) — same
    # convention as Holiday.end_date, so every pre-existing single-day row
    # stays valid untouched rather than needing `date` copied into it. A
    # multi-day request sets this to the last day it covers, and every
    # range check reads it as COALESCE(end_date, date).
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Null = full day. "First Half"/"Second Half" means only that half is
    # WFH — the employee still has to physically check in for the other
    # half (AttendanceService shifts that day's marking window to the other
    # half's slot). Only meaningful for a single-day request (end_date
    # null) — WfhRequestService rejects it alongside a real range.
    half_day: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")  # Pending/Approved/Rejected
    decision_note: Mapped[str] = mapped_column(Text, nullable=True)
    decided_by: Mapped[str] = mapped_column(String(255), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)

    __table_args__ = (
        # There was a UniqueConstraint("employee_id", "date") here. It had to
        # go: a rejected request must not permanently burn its dates, and the
        # constraint made re-applying for a rejected day fail with a raw
        # IntegrityError (500) rather than being allowed. It also only ever
        # covered the START day, so it never actually prevented two ranges
        # overlapping on their later days anyway.
        #
        # WfhRequestService.create_request/update_own_request enforce the
        # real rule instead, via find_overlapping_for_employee: a new request
        # may not overlap an existing Pending or Approved one, but Rejected
        # ones are ignored entirely so those dates are free again. See
        # scripts/migrate_wfh_drop_unique.py for dropping it from existing DBs.
        Index("ix_wfh_employee_id", "employee_id"),
        Index("ix_wfh_status", "status"),
    )
