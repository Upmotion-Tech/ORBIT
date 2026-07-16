import uuid
from datetime import datetime

from sqlalchemy import String, Float, DateTime, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    employee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    week: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g., "23–27 Jun"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )

    __table_args__ = (
        Index("ix_time_entries_project_id", "project_id"),
        Index("ix_time_entries_employee_name", "employee_name"),
    )
