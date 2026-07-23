import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    # What this notification is about, so the frontend can deep-link straight
    # to it (matches the existing #/type/id deep-link mechanism used by
    # search results). Nullable — plenty of notifications (broadcasts,
    # WFH/leave decisions) don't map to a specific drawer-openable record and
    # just fall back to a plain page route client-side by `type` instead.
    related_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    related_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )

    __table_args__ = (
        Index("ix_notifications_user_id", "user_id"),
        Index("ix_notifications_is_read", "is_read"),
    )
