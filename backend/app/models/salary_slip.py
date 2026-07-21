import uuid
from datetime import date, datetime
from sqlalchemy import String, Float, Date, DateTime, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.core.time import now_pkt

class SalarySlip(Base):
    __tablename__ = "salary_slips"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False)
    month: Mapped[str] = mapped_column(String(7), nullable=False) # "YYYY-MM"
    gross_salary: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tax: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    other_deductions: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    deduction_reason: Mapped[str] = mapped_column(Text, nullable=True)
    bonus: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    allowances: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    net_salary: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    payment_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Unpaid") # Paid, Unpaid
    payment_date: Mapped[date] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)

    # Relationship
    employee = relationship("Employee")

    __table_args__ = (
        Index("ix_salary_slips_employee_id", "employee_id"),
        Index("ix_salary_slips_month", "month"),
        Index("uq_employee_month", "employee_id", "month", unique=True),
    )
