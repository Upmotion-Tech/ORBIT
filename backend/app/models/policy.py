import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time import now_pkt


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="General")

    # Either content (owner typed/pasted text) or file_data (owner uploaded a
    # PDF) is populated — never both required, a policy can have just one.
    content: Mapped[str] = mapped_column(Text, nullable=True)
    # Stored directly in Postgres (Neon), not on local disk — Render's
    # filesystem is ephemeral and gets wiped on every redeploy, which
    # silently 404'd every previously-uploaded policy PDF the first time the
    # backend redeployed after upload. The DB is already the one thing in
    # this stack that reliably persists across deploys.
    file_data: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=True)
    # Text extracted from the uploaded PDF at upload time, cached here so the
    # RAG assistant can read it straight from the DB on every query instead
    # of re-parsing the PDF binary each time. Still "live" data, not a static
    # index — it's overwritten whenever the file changes.
    extracted_text: Mapped[str] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_pkt, onupdate=now_pkt)
