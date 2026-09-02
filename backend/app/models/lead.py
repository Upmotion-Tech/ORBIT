import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import String, Float, Date, DateTime, Boolean, Text, ForeignKey, Index, LargeBinary
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

    # When the stage actually moved INTO a terminal stage (Won/Lost), set
    # server-side on that transition and cleared if the lead is reopened —
    # the direct counterpart of Project.completed_at, and it exists for the
    # same reason: it drives "a closed lead stays on the pipeline board for
    # 20 days, then falls off into Past Leads" (see LEAD_STALE_DAYS in
    # crm/page.tsx).
    #
    # Deliberately NOT actual_closure_date, which is a user-editable Date in
    # the lead drawer: that can be left blank, backdated, or edited at will,
    # so keying a visibility window off it would be both gameable and
    # undefined for any lead whose rep never filled it in. updated_at is no
    # good either — it moves on every edit, so adding a comment to a lead
    # closed months ago would drag it back onto the live board.
    #
    # NULL means "closed at an unknown time" (every row that predates this
    # column) and is treated as long-closed, i.e. it stays in Past Leads.
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Stored directly in Postgres (Neon), not on local disk — Render's
    # filesystem is ephemeral and wipes every uploaded file on redeploy (the
    # same fix already applied to Policy PDFs; see policy_service.py).
    scope_document_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    scope_document_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    signed_contract_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    signed_contract_filename: Mapped[str] = mapped_column(String(255), nullable=True)

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
