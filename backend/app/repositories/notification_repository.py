import uuid
from datetime import timedelta
from typing import Optional

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_pkt
from app.models.notification import Notification


class NotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all_for_user(self, user_id: str, roles: Optional[list] = None, limit: int = 50) -> list[Notification]:
        # Matches both notifications aimed at this specific employee (user_id
        # = their real id) and role-broadcast notifications (user_id = a
        # role string like "hr" / "finance" / "owner"). `roles` are the
        # employee's real access_levels from their auth token, not a UI
        # persona — an employee can hold more than one, so every assigned
        # role's broadcast targets are included.
        # "all" deliberately does NOT match for everyone — only owner/admin —
        # per the standing policy that only Owners get company-wide "all
        # info" notifications; every other employee should only ever see
        # notifications actually about them (their own leave decisions,
        # comments/assignments on projects/tasks/leads they're on). Every
        # write site that used to create a real user_id="all" notification
        # has been fixed to target a specific person or "owner" instead, but
        # this read-side restriction is the actual enforcement — it means a
        # future accidental "all" notification can't silently leak to every
        # employee again regardless of role.
        targets = {user_id}
        for role in (roles or []):
            targets.add(role)
            if role in ("owner", "admin"):
                targets.update(["owner", "admin", "all"])
            elif role == "hr":
                targets.add("hr")
        query = select(Notification).where(
            Notification.user_id.in_(targets)
        ).order_by(Notification.created_at.desc()).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, notification_id: str) -> Optional[Notification]:
        query = select(Notification).where(Notification.id == notification_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(
        self, user_id: str, notif_type: str, title: str, message: str,
        related_type: Optional[str] = None, related_id: Optional[str] = None,
    ) -> Notification:
        notification = Notification(
            id=str(uuid.uuid4()),
            user_id=user_id,
            type=notif_type,
            title=title,
            message=message,
            is_read=False,
            related_type=related_type,
            related_id=related_id,
        )
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def update_read_status(self, notification: Notification, is_read: bool) -> Notification:
        notification.is_read = is_read
        await self.db.flush()
        return notification

    async def delete_older_than(self, hours: int = 24) -> int:
        cutoff = now_pkt() - timedelta(hours=hours)
        stmt = delete(Notification).where(Notification.created_at < cutoff)
        result = await self.db.execute(stmt)
        await self.db.flush()
        return result.rowcount or 0

    async def mark_all_read(self, user_id: str, roles: Optional[list] = None) -> None:
        # Same "all" restriction as find_all_for_user above — only owner/admin
        # can ever have an "all"-targeted notification to mark read.
        targets = {user_id}
        for role in (roles or []):
            targets.add(role)
            if role in ("owner", "admin"):
                targets.update(["owner", "admin", "all"])
        stmt = (
            update(Notification)
            .where(Notification.user_id.in_(targets), Notification.is_read == False)
            .values(is_read=True)
        )
        await self.db.execute(stmt)
        await self.db.flush()
