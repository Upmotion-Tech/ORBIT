from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException, status

from app.core.time import now_pkt
from app.models.task import Task
from app.repositories.task_repository import TaskRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.task import TaskResponse


class TaskService:
    def __init__(
        self,
        task_repo: TaskRepository,
        project_repo: ProjectRepository,
        notification_repo: Optional[NotificationRepository] = None,
    ):
        self.task_repo = task_repo
        self.project_repo = project_repo
        self.notification_repo = notification_repo

    async def list_tasks(
        self,
        search: Optional[str] = None,
        project_id: Optional[str] = None,
        assignee: Optional[str] = None,
        status_filter: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        persona: str = "owner",
    ) -> list[TaskResponse]:
        assigned_to_member = "Kofi Mensah" if persona == "dev" else None

        tasks = await self.task_repo.find_all(
            search=search,
            project_id=project_id,
            assignee=assignee,
            status=status_filter,
            date_from=date_from,
            date_to=date_to,
            assigned_to_member=assigned_to_member,
        )
        return [TaskResponse.model_validate(t) for t in tasks]

    async def get_task(self, task_id: str, persona: str = "owner") -> Optional[TaskResponse]:
        task = await self.task_repo.find_by_id(task_id)
        if not task:
            return None

        # Dev member visibility check
        if persona == "dev":
            project = await self.project_repo.find_by_id(task.project_id)
            if task.assignee != "Kofi Mensah" and (not project or "Kofi Mensah" not in project.team):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this task.",
                )

        return TaskResponse.model_validate(task)

    async def create_task(self, data: dict, user: str = "anonymous", persona: str = "owner") -> TaskResponse:
        if persona not in ("owner", "admin", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to create tasks.",
            )

        project = await self.project_repo.find_by_id(data["project_id"])
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found.",
            )

        # Automatic assignee assignment: project creator or default to Ana Reyes (Dev Head)
        if not data.get("assignee"):
            data["assignee"] = project.created_by or "Ana Reyes"

        data["created_by"] = user
        data["updated_by"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()

        task = await self.task_repo.create(data)

        # Generate notification for assigned developer
        if self.notification_repo and task.assignee:
            target_user = "dev" if task.assignee == "Kofi Mensah" else "all"
            await self.notification_repo.create(
                user_id=target_user,
                notif_type="Task Assigned",
                title="Assigned to new task",
                message=f"You have been assigned to task '{task.title}' under project '{project.name}'.",
            )

        return TaskResponse.model_validate(task)

    async def update_task(self, task_id: str, data: dict, user: str = "anonymous", persona: str = "owner") -> TaskResponse:
        task = await self.task_repo.find_by_id(task_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found.",
            )

        # Enforce task permissions: dev cannot edit tasks
        if persona == "dev":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Dev members cannot edit task parameters.",
            )

        old_assignee = task.assignee
        data["updated_by"] = user
        updated_task = await self.task_repo.update(task, data)

        # Notify if assignee changed
        if self.notification_repo and "assignee" in data and updated_task.assignee != old_assignee:
            project = await self.project_repo.find_by_id(updated_task.project_id)
            proj_name = project.name if project else "Unknown Project"
            target_user = "dev" if updated_task.assignee == "Kofi Mensah" else "all"
            await self.notification_repo.create(
                user_id=target_user,
                notif_type="Task Assigned",
                title="Assigned to task",
                message=f"You have been assigned to task '{updated_task.title}' under project '{proj_name}'.",
            )

        return TaskResponse.model_validate(updated_task)

    async def delete_task(self, task_id: str, persona: str = "owner") -> bool:
        task = await self.task_repo.find_by_id(task_id)
        if not task:
            return False

        if persona == "dev":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Dev members cannot delete tasks.",
            )

        await self.task_repo.soft_delete(task)
        return True
