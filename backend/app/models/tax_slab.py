import uuid
from datetime import datetime

from sqlalchemy import String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class TaxSlab(Base):
    """One row = one annual-income bracket of the salaried-individual income
    tax slab table (Setup > Tax Slabs, Owner-only). min_salary/max_salary are
    ANNUAL figures — the payroll engine annualizes a monthly gross (x12)
    before matching against these. max_salary null = open-ended top bracket.
    tax_percentage is a plain percentage number (5 means 5%, not 0.05).
    fixed_tax is the cumulative tax already owed from all lower brackets, so
    tax = fixed_tax + tax_percentage% * (annual_salary - min_salary) — the
    standard marginal/progressive formula, not a flat rate on the whole salary."""

    __tablename__ = "tax_slabs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    min_salary: Mapped[float] = mapped_column(Float, nullable=False)
    max_salary: Mapped[float] = mapped_column(Float, nullable=True)
    tax_percentage: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fixed_tax: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
