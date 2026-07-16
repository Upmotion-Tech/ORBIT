import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Float, Text, Integer, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class HiringCandidate(Base):
    __tablename__ = "hiring_candidates"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    opening_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("job_openings.id"), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    applied_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )
    resume_url: Mapped[str] = mapped_column(String(500), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    stage: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Applied",
    )
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    opening = relationship("JobOpening", back_populates="candidates")

    __table_args__ = (
        Index("ix_hiring_candidates_opening_id", "opening_id"),
        Index("ix_hiring_candidates_stage", "stage"),
    )
