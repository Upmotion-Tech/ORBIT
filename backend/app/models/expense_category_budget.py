import uuid
from datetime import datetime

from sqlalchemy import String, Float, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class ExpenseCategoryBudget(Base):
    __tablename__ = "expense_category_budgets"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    category: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    monthly_budget_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)
