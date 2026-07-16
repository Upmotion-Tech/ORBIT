import uuid
from datetime import date, datetime

from sqlalchemy import String, Date, DateTime, Text, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    assignee: Mapped[str] = mapped_column(String(255), nullable=True)
    deadline: Mapped[date] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Not Started")
    description: Mapped[str] = mapped_column(Text, nullable=True)

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
    project = relationship("Project", back_populates="tasks")
    comments = relationship(
        "ProjectComment",
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="ProjectComment.created_at.asc()",
    )

    __table_args__ = (
        Index("ix_tasks_project_id", "project_id"),
        Index("ix_tasks_title", "title"),
        Index("ix_tasks_assignee", "assignee"),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_deleted_at", "deleted_at"),
    )
