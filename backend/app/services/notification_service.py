from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_pkt
from app.models.notification import Notification
from app.models.task import Task
from app.repositories.notification_repository import NotificationRepository
from app.repositories.task_repository import TaskRepository


class NotificationService:
    def __init__(
        self,
        notification_repo: NotificationRepository,
        task_repo: Optional[TaskRepository] = None,
    ):
        self.notification_repo = notification_repo
        self.task_repo = task_repo

    async def get_notifications(self, user_id: str, roles: Optional[list] = None, user_name: str = "") -> list[Notification]:
        # The automatic "Task Due Soon" / "Task Overdue" check that used to
        # run here on every single notification fetch is disabled — it's
        # what was flooding every persona's notification list with nothing
        # but time/deadline noise, drowning out the notifications that
        # actually matter (leave approved/rejected, project/task assignment).
        # Notifications are now purely event-driven — created once, at the
        # moment something real happens — never synthesized on read.
        # `_check_and_create_task_alerts` is left below, unused, in case a
        # real (rate-limited, opt-in) due-date reminder feature is wanted later.
        roles = roles or []

        return await self.notification_repo.find_all_for_user(user_id, roles)

    async def mark_read(self, notification_id: str, is_read: bool = True) -> Optional[Notification]:
        notification = await self.notification_repo.find_by_id(notification_id)
        if not notification:
            return None
        return await self.notification_repo.update_read_status(notification, is_read)

    async def mark_all_read(self, user_id: str, roles: Optional[list] = None) -> None:
        await self.notification_repo.mark_all_read(user_id, roles)

    async def create_notification(self, user_id: str, notif_type: str, title: str, message: str) -> Notification:
        return await self.notification_repo.create(user_id, notif_type, title, message)

    async def _check_and_create_task_alerts(self, assignee: Optional[str], target_user_id: str) -> None:
        today = now_pkt().date()
        
        # Find all uncompleted tasks
        tasks = await self.task_repo.find_all(assignee=assignee)
        uncompleted_tasks = [t for t in tasks if t.status != "Completed" and t.deadline]

        # Get existing alert titles for this user to avoid duplicate notification spam
        existing_notifs = await self.notification_repo.find_all_for_user(target_user_id, limit=200)
        existing_titles = {n.title for n in existing_notifs}

        for task in uncompleted_tasks:
            due_date = task.deadline
            
            # 1. Overdue Check
            if due_date < today:
                title = f"Task Overdue: {task.title}"
                if title not in existing_titles:
                    await self.notification_repo.create(
                        user_id=target_user_id,
                        notif_type="Task Overdue",
                        title=title,
                        message=f"Task '{task.title}' was due on {due_date.strftime('%d %b %Y')} and is now overdue.",
                    )
            
            # 2. Due Soon Check (due today or tomorrow)
            elif today <= due_date:
                days_left = (due_date - today).days
                if days_left <= 1:
                    title = f"Task Due Soon: {task.title}"
                    if title not in existing_titles:
                        await self.notification_repo.create(
                            user_id=target_user_id,
                            notif_type="Task Due Soon",
                            title=title,
                            message=f"Task '{task.title}' is due in {days_left} day(s) (on {due_date.strftime('%d %b %Y')}).",
                        )
