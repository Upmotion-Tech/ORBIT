import uuid
from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, Date, DateTime, Float, Boolean, Text, JSON, Index, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    manager: Mapped[str] = mapped_column(String(255), nullable=True)
    employment_type: Mapped[str] = mapped_column(String(50), nullable=False, default="Full-time")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    salary: Mapped[float] = mapped_column(Float, default=0.0)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # True whenever the current password_hash was set by someone other than
    # the employee themselves (HR/Owner assigning it on create, or resetting
    # it later) — forces a mandatory change-password screen on next login.
    # Flipped back to False only by the employee's own successful
    # POST /api/auth/change-password.
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Login-access switch, separate from `status` (which tracks employment
    # state like Active/Terminated for HR/directory purposes). Owner-only:
    # False blocks login outright and forces an already-logged-in session
    # to be signed out on its next authenticated request (see get_current_user).
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    access_levels: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=lambda: ["employee"])
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Active")
    probation_end: Mapped[date] = mapped_column(Date, nullable=True)
    # Stored directly in Postgres (Neon), not on local disk — Render's
    # filesystem is ephemeral and wipes every uploaded file on redeploy (same
    # fix already applied to Policy PDFs, Lead documents, and Project
    # attachments — see policy_service.py for the original of this pattern).
    contract_file_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    contract_file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    birthdate: Mapped[date] = mapped_column(Date, nullable=True)
    # Personal contact numbers — always stored as "+92" + 10 digits (enforced
    # client-side; kept as a plain string here since it's a phone number, not
    # a numeric value to compute with).
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    emergency_contact: Mapped[str] = mapped_column(String(20), nullable=True)
    emergency_contact_relation: Mapped[str] = mapped_column(String(100), nullable=True)
    # Always stored formatted as "XXXXX-XXXXXXX-X" (e.g. 35201-5746852-5) —
    # enforced both client-side (input mask) and server-side (schema regex).
    cnic: Mapped[str] = mapped_column(String(15), nullable=True)

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
    deleted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_employees_email", "email"),
        Index("ix_employees_department", "department"),
        Index("ix_employees_status", "status"),
        Index("ix_employees_deleted_at", "deleted_at"),
    )
