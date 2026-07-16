from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.core.database import Base
from app.core.time import now_pkt


class CurrencyPreference(Base):
    """A user's chosen reporting currency for one module (e.g. dashboard, reports).

    `user_id` is the persona/user identifier — there's no JWT-based login yet,
    so the frontend passes the active persona id here. Swapping in real
    authenticated user ids later doesn't require changing this table's shape.
    """

    __tablename__ = "currency_preferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
        onupdate=now_pkt,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "module", name="uq_currency_pref_user_module"),
    )
