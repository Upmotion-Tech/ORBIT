import uuid

from sqlalchemy import String, Date
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[Date] = mapped_column(Date, nullable=False)
