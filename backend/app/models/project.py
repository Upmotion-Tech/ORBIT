import uuid
from datetime import date, datetime

from sqlalchemy import String, Float, Date, DateTime, Boolean, Text, JSON, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    client: Mapped[str] = mapped_column(String(255), nullable=False)
    lead_id: Mapped[str] = mapped_column(String(36), ForeignKey("leads.id"), nullable=True)
    deadline: Mapped[date] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Not Started")
    at_risk: Mapped[bool] = mapped_column(Boolean, default=False)
    budget: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    team: Mapped[list[str]] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
        onupdate=now_pkt,
    )
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    tasks = relationship(
        "Task",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    comments = relationship(
        "ProjectComment",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectComment.created_at.asc()",
    )
    attachments = relationship(
        "ProjectAttachment",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_projects_name", "name"),
        Index("ix_projects_client", "client"),
        Index("ix_projects_status", "status"),
        Index("ix_projects_deleted_at", "deleted_at"),
    )
