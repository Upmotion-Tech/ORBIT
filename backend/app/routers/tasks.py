from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_role, get_current_user
from app.repositories.task_repository import TaskRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.task_service import TaskService
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse
from app.schemas.comment import CommentCreate, CommentResponse

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


def get_task_service(db: AsyncSession = Depends(get_db)) -> TaskService:
    return TaskService(
        TaskRepository(db),
        ProjectRepository(db),
        NotificationRepository(db),
        EmployeeRepository(db),
        AuditLogRepository(db),
    )


@router.get("", response_model=list[TaskResponse])
async def list_tasks(
    search: Optional[str] = None,
    project_id: Optional[str] = None,
    assignee: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    persona: str = Depends(get_persona_role),
    current_user: dict = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
):
    return await service.list_tasks(
        search=search,
        project_id=project_id,
        assignee=assignee,
        status_filter=status,
        date_from=date_from,
        date_to=date_to,
        persona=persona,
        user_name=current_user.get("name", ""),
    )


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    persona: str = Depends(get_persona_role),
    current_user: dict = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
):
    task = await service.get_task(task_id, persona, current_user.get("name", ""))
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )
    return task


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    data: TaskCreate,
    persona: str = Depends(get_persona_role),
    service: TaskService = Depends(get_task_service),
):
    user_name = "Jordan Blake" if persona in ("owner", "finance") else persona
    return await service.create_task(data.model_dump(), user=user_name, persona=persona)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    data: TaskUpdate,
    persona: str = Depends(get_persona_role),
    service: TaskService = Depends(get_task_service),
):
    user_name = "Jordan Blake" if persona in ("owner", "finance") else persona
    return await service.update_task(
        task_id,
        data.model_dump(exclude_unset=True),
        user=user_name,
        persona=persona,
    )


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    persona: str = Depends(get_persona_role),
    current_user: dict = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
):
    user_name = current_user.get("name") or persona
    success = await service.delete_task(task_id, persona=persona, user=user_name)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )
    return {"success": True, "message": "Task deleted successfully."}


# --- Comments ---

@router.post("/{task_id}/comments", response_model=CommentResponse)
async def add_comment(
    task_id: str,
    data: CommentCreate,
    persona: str = Depends(get_persona_role),
    current_user: dict = Depends(get_current_user),
    service: TaskService = Depends(get_task_service),
):
    task = await service.task_repo.find_by_id(task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    user_name = current_user.get("name") or persona

    # Permissions/Visibility check
    project = await service.project_repo.find_by_id(task.project_id)
    if persona == "dev" and task.assignee != user_name and (not project or user_name not in project.team):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot comment on tasks you are not assigned to.",
        )

    comment = await service.task_repo.add_comment(
        task_id=task_id,
        project_id=task.project_id,
        parent_id=data.parent_id,
        author=user_name,
        text=data.text,
    )

    # Generate Notification for Comments
    if service.notification_repo and project:
        # Notify task assignee (if not poster) and project team
        notified = {user_name}

        target_list = [task.assignee] if task.assignee else []
        target_list.extend(project.team or [])

        for member in target_list:
            if member in notified:
                continue
            notified.add(member)
            target_user = await service._resolve_assignee_notification_target(member)
            await service.notification_repo.create(
                user_id=target_user,
                notif_type="Comment Added",
                title=f"New comment on task: {task.title}",
                message=f"{user_name} said: '{data.text[:50]}...'",
            )

        # Owner should see all task activity, even on tasks whose project
        # they aren't personally on the team of.
        if persona != "owner":
            await service.notification_repo.create(
                user_id="owner",
                notif_type="Comment Added",
                title=f"New comment on task: {task.title}",
                message=f"{user_name} said: '{data.text[:50]}...'",
            )

    return CommentResponse.model_validate(comment)


@router.get("/{task_id}/comments", response_model=list[CommentResponse])
async def get_comments(
    task_id: str,
    service: TaskService = Depends(get_task_service),
):
    comments = await service.task_repo.get_comments(task_id)
    return [CommentResponse.model_validate(c) for c in comments]
