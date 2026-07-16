import uuid
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


class NotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all_for_user(self, user_id: str, limit: int = 50) -> list[Notification]:
        targets = [user_id, "all"]
        if user_id in ("owner", "admin"):
            targets.extend(["owner", "admin"])
        elif user_id in ("hr", "hr_admin"):
            targets.extend(["hr", "hr_admin"])
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

    async def mark_all_read(self, user_id: str) -> None:
        targets = [user_id, "all"]
        if user_id in ("hr", "hr_admin"):
            targets.extend(["hr", "hr_admin"])
        stmt = (
            update(Notification)
            .where(Notification.user_id.in_(targets), Notification.is_read == False)
            .values(is_read=True)
        )
        await self.db.execute(stmt)
        await self.db.flush()
