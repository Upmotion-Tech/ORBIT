import uuid
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


class NotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all_for_user(self, user_id: str, roles: Optional[list] = None, limit: int = 50) -> list[Notification]:
        # Matches both notifications aimed at this specific employee (user_id
        # = their real id) and role-broadcast notifications (user_id = a
        # role string like "hr" / "all"). `roles` are the employee's real
        # access_levels from their auth token, not a UI persona — an
        # employee can hold more than one, so every assigned role's
        # broadcast targets are included.
        targets = {user_id, "all"}
        for role in (roles or []):
            targets.add(role)
            if role in ("owner", "admin"):
                targets.update(["owner", "admin"])
            elif role in ("hr", "hr_admin"):
                targets.update(["hr", "hr_admin"])
        query = select(Notification).where(
            Notification.user_id.in_(targets)
        ).order_by(Notification.created_at.desc()).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, notification_id: str) -> Optional[Notification]:
        query = select(Notification).where(Notification.id == notification_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, user_id: str, notif_type: str, title: str, message: str) -> Notification:
        notification = Notification(
            id=str(uuid.uuid4()),
            user_id=user_id,
            type=notif_type,
            title=title,
            message=message,
            is_read=False,
        )
        self.db.add(notification)
        await self.db.flush()
        return notification

    async def update_read_status(self, notification: Notification, is_read: bool) -> Notification:
        notification.is_read = is_read
        await self.db.flush()
        return notification

    async def mark_all_read(self, user_id: str, roles: Optional[list] = None) -> None:
        targets = {user_id, "all"}
        for role in (roles or []):
            targets.add(role)
            if role in ("hr", "hr_admin"):
                targets.update(["hr", "hr_admin"])
        stmt = (
            update(Notification)
            .where(Notification.user_id.in_(targets), Notification.is_read == False)
            .values(is_read=True)
        )
        await self.db.execute(stmt)
        await self.db.flush()
