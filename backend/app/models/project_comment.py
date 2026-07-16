import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Text, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class ProjectComment(Base):
    __tablename__ = "project_comments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True)
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id"), nullable=True)
    parent_id: Mapped[str] = mapped_column(String(36), ForeignKey("project_comments.id"), nullable=True)
    author: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )

    # Relationships
    project = relationship("Project", back_populates="comments")
    task = relationship("Task", back_populates="comments")
    
    # Self-referential relationship for threaded comments
    replies = relationship(
        "ProjectComment",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="ProjectComment.created_at.asc()",
    )
    parent = relationship("ProjectComment", back_populates="replies", remote_side=[id])

    __table_args__ = (
        Index("ix_project_comments_project_id", "project_id"),
        Index("ix_project_comments_task_id", "task_id"),
        Index("ix_project_comments_parent_id", "parent_id"),
    )
