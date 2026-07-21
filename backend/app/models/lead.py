import uuid
from datetime import date, datetime

from sqlalchemy import String, Float, Date, DateTime, Boolean, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.time import now_pkt


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_contact_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    assigned_rep: Mapped[str] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=True)
    medium: Mapped[str] = mapped_column(String(100), nullable=True)
    value: Mapped[float] = mapped_column(Float, default=0.0)
    stage: Mapped[str] = mapped_column(String(50), nullable=False, default="New")
    description: Mapped[str] = mapped_column(Text, nullable=True)

    date_received: Mapped[date] = mapped_column(Date, nullable=True)
    expected_closure_date: Mapped[date] = mapped_column(Date, nullable=True)
    actual_closure_date: Mapped[date] = mapped_column(Date, nullable=True)
    follow_up_date: Mapped[date] = mapped_column(Date, nullable=True)

    scope_document_url: Mapped[str] = mapped_column(String(500), nullable=True)
    signed_contract_url: Mapped[str] = mapped_column(String(500), nullable=True)

    is_locked_revenue: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_pkt,
        onupdate=now_pkt,
    )
    created_by: Mapped[str] = mapped_column(String(255), nullable=True)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=True)

    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    activities = relationship(
        "LeadActivity",
        back_populates="lead",
        cascade="all, delete-orphan",
        order_by="LeadActivity.created_at.desc()",
    )

    __table_args__ = (
        Index("ix_leads_company_name", "company_name"),
        Index("ix_leads_assigned_rep", "assigned_rep"),
        Index("ix_leads_source", "source"),
        Index("ix_leads_stage", "stage"),
        Index("ix_leads_deleted_at", "deleted_at"),
        Index("ix_leads_date_received", "date_received"),
        Index("ix_leads_follow_up_date", "follow_up_date"),
        Index("ix_leads_customer_id", "customer_id"),
    )
