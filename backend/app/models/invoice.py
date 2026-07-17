import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import String, Float, Date, DateTime, ForeignKey, Index, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.core.time import now_pkt

class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    client: Mapped[str] = mapped_column(String(255), nullable=False)
    # Primary/first project, kept for the list view's Project column and
    # existing project filter — the authoritative per-project breakdown now
    # lives in line_items, which can span more than one project.
    project_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    # list[{"project_id": str|None, "description": str, "qty": float, "unit_price": float}]
    line_items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    invoice_type: Mapped[str] = mapped_column(String(100), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Draft")
    paid_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    bank_account_name: Mapped[str] = mapped_column(String(255), nullable=True)
    bank_account_number: Mapped[str] = mapped_column(String(100), nullable=True)
    bank_iban: Mapped[str] = mapped_column(String(100), nullable=True)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=True)

    # Relationship
    project = relationship("Project")

    __table_args__ = (
        Index("ix_invoices_project_id", "project_id"),
        Index("ix_invoices_status", "status"),
    )
