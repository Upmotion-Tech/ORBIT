import uuid
from datetime import date as date_type
from typing import Optional

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
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    # Null means a single-day holiday (the holiday is just `date`) — most
    # holidays are one day, so this avoids duplicating `date` into `end_date`
    # for every single-day row. A multi-day holiday (e.g. Eid) sets this to
    # the last day it covers.
    end_date: Mapped[Optional[date_type]] = mapped_column(Date, nullable=True)
