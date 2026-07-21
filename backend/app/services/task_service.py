from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException, status

from app.core.permissions import is_dev_member
from app.core.time import now_pkt
from app.models.task import Task
from app.repositories.task_repository import TaskRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.task import TaskResponse


class TaskService:
    def __init__(
        self,
        task_repo: TaskRepository,
        project_repo: ProjectRepository,
        notification_repo: Optional[NotificationRepository] = None,
        employee_repo: Optional[EmployeeRepository] = None,
        audit_repo = None,
    ):
        self.task_repo = task_repo
        self.project_repo = project_repo
        self.notification_repo = notification_repo
        self.employee_repo = employee_repo
        self.audit_repo = audit_repo

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Task", label, detail)

    async def list_tasks(
        self,
        search: Optional[str] = None,
        project_id: Optional[str] = None,
        assignee_id: Optional[str] = None,
        status_filter: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        persona: str = "owner",
        user_id: str = "",
        department: str = "",
        roles: Optional[list] = None,
    ) -> list[TaskResponse]:
        # Dev Member department employees only see tasks assigned to them directly or on their assigned projects
        assigned_to_member_id = user_id if is_dev_member(roles, department) else None

        tasks = await self.task_repo.find_all(
            search=search,
            project_id=project_id,
            assignee_id=assignee_id,
            status=status_filter,
            date_from=date_from,
            date_to=date_to,
            assigned_to_member_id=assigned_to_member_id,
        )
        return [TaskResponse.model_validate(t) for t in tasks]

    async def get_task(
        self,
        task_id: str,
        persona: str = "owner",
        user_id: str = "",
        department: str = "",
        roles: Optional[list] = None,
    ) -> Optional[TaskResponse]:
        task = await self.task_repo.find_by_id(task_id)
        if not task:
            return None

        # Dev Member department visibility check
        if is_dev_member(roles, department):
            project = await self.project_repo.find_by_id(task.project_id)
            if task.assignee_id != user_id and (not project or user_id not in (project.team_ids or [])):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this task.",
                )

        return TaskResponse.model_validate(task)


    async def create_task(self, data: dict, user: str = "anonymous", persona: str = "owner") -> TaskResponse:
        # Only owners can create tasks. Dev members can view and comment on
        # tasks assigned to them, but cannot create or edit.
        if persona != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners can create tasks.",
            )

        project = await self.project_repo.find_by_id(data["project_id"])
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found.",
            )

        # Defaults to today, but the caller can set it earlier (e.g. backfilling
        # work that already started) — never forced, only filled in if omitted.
        if not data.get("start_date"):
            data["start_date"] = now_pkt().date()

        data["created_by_id"] = user  # Store the creator's employee ID
        data["updated_by_id"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()

        task = await self.task_repo.create(data)

        # Generate notification for assigned developer
        if self.notification_repo and task.assignee_id:
            await self.notification_repo.create(
                user_id=task.assignee_id,  # Target the assigned employee by their ID
                notif_type="Task Assigned",
                title="Assigned to new task",
                message=f"You have been assigned to task '{task.title}' under project '{project.name}'.",
            )

        await self._audit(user, "Created", task.title, f"Project '{project.name}'")

        return TaskResponse.model_validate(task)

    async def update_task(self, task_id: str, data: dict, user: str = "anonymous", persona: str = "owner") -> TaskResponse:
        task = await self.task_repo.find_by_id(task_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found.",
            )

        # Only owners can edit tasks. Dev members can view and comment on
        # tasks assigned to them, but cannot edit.
        if persona != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners can edit tasks.",
            )

        old_assignee_id = task.assignee_id
        old_status = task.status
        data["updated_by_id"] = user
        updated_task = await self.task_repo.update(task, data)

        # Notify if assignee changed
        if self.notification_repo and "assignee_id" in data and updated_task.assignee_id != old_assignee_id:
            project = await self.project_repo.find_by_id(updated_task.project_id)
            proj_name = project.name if project else "Unknown Project"
            await self.notification_repo.create(
                user_id=updated_task.assignee_id,  # Target by employee ID
                notif_type="Task Assigned",
                title="Assigned to task",
                message=f"You have been assigned to task '{updated_task.title}' under project '{proj_name}'.",
            )

        if "status" in data and updated_task.status != old_status:
            await self._audit(user, "Status Changed", updated_task.title, f"'{old_status}' → '{updated_task.status}'")
        else:
            changed = sorted(k for k in data.keys() if k not in ("updated_by_id", "updated_at"))
            await self._audit(user, "Updated", updated_task.title, f"Fields updated: {', '.join(changed)}" if changed else None)

        return TaskResponse.model_validate(updated_task)

    async def delete_task(self, task_id: str, persona: str = "owner", user: str = "anonymous") -> bool:
        task = await self.task_repo.find_by_id(task_id)
        if not task:
            return False

        # Only owners can delete tasks. Dev members cannot delete tasks.
        if persona != "owner":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners can delete tasks.",
            )

        await self._audit(user, "Deleted", task.title)
        await self.task_repo.soft_delete(task)
        return True
