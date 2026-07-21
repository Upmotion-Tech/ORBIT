import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    # The only required field — everything else is filled in later from the
    # Customer detail drawer, per explicit request ("many fields... all
    # optional"). Auto-populated from a Lead's company_name/client_contact_name
    # at lead-creation time (see lead_service.py's create_lead).
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    primary_contact_name: Mapped[str] = mapped_column(String(255), nullable=True)
    primary_contact_email: Mapped[str] = mapped_column(String(255), nullable=True)
    primary_contact_phone: Mapped[str] = mapped_column(String(50), nullable=True)
    industry: Mapped[str] = mapped_column(String(255), nullable=True)
    website: Mapped[str] = mapped_column(String(255), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_customers_company_name", "company_name"),
        Index("ix_customers_deleted_at", "deleted_at"),
    )
