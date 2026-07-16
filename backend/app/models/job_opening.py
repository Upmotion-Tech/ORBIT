import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class JobOpening(Base):
    __tablename__ = "job_openings"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Open",
    )
    salary_bracket: Mapped[str] = mapped_column(String(255), nullable=True)
    experience: Mapped[str] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )
    closed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)

    candidates = relationship(
        "HiringCandidate",
        back_populates="opening",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_job_openings_status", "status"),
        Index("ix_job_openings_department", "department"),
    )
