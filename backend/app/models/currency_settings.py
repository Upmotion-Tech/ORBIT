from datetime import datetime

from sqlalchemy import String, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class CurrencySettings(Base):
    """Singleton row (id=1) holding the app-wide USD -> PKR exchange rate."""

    __tablename__ = "currency_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)

    base_currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    usd_to_pkr_rate: Mapped[float] = mapped_column(Float, nullable=False, default=276.52)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
        onupdate=now_pkt,
    )
    updated_by: Mapped[str] = mapped_column(String(255), nullable=True)
