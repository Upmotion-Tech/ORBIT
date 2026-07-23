import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Integer, Index, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class ProjectAttachment(Base):
    __tablename__ = "project_attachments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Stored directly in Postgres (Neon), not on local disk — Render's
    # filesystem is ephemeral and wipes every uploaded file on redeploy (the
    # same fix already applied to Policy PDFs and Lead documents).
    file_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )

    # Relationships
    project = relationship("Project", back_populates="attachments")

    __table_args__ = (
        Index("ix_project_attachments_project_id", "project_id"),
    )
