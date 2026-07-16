import uuid
from datetime import date, datetime
from sqlalchemy import String, Float, Date, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.core.time import now_pkt

class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    expected_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Expected")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=True)

    # Relationship
    project = relationship("Project")

    __table_args__ = (
        Index("ix_milestones_project_id", "project_id"),
        Index("ix_milestones_status", "status"),
    )
