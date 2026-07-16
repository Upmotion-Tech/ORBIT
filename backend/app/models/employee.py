import uuid
from datetime import datetime, date

from sqlalchemy import String, Date, DateTime, Float, Boolean, Text, Index
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
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="Active")
    probation_end: Mapped[date] = mapped_column(Date, nullable=True)
    contract_file: Mapped[bool] = mapped_column(Boolean, default=False)

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
