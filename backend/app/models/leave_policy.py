import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class LeavePolicy(Base):
    __tablename__ = "leave_policies"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    casual_days: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    sick_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    annual_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
        onupdate=now_pkt,
    )
