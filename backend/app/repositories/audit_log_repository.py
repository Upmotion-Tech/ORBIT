import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


class AuditLogRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        actor: str,
        action: str,
        entity_type: str,
        entity_label: str,
        detail: Optional[str] = None,
    ) -> AuditLog:
        # `actor` is expected to be a real employee ID (actor_id is a NOT
        # NULL FK to employees.id) — every caller derives it from
        # current_user.get("user_id"), which get_current_user has already
        # validated resolves to a real, active employee.
        entry = AuditLog(
            id=str(uuid.uuid4()),
            actor_id=actor,
            action=action,
            entity_type=entity_type,
            entity_label=entity_label,
            detail=detail,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def find_all(self, limit: int = 200) -> list[AuditLog]:
        query = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())
