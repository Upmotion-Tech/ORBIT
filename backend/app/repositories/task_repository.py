import uuid
from datetime import date
from typing import Optional

from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import now_pkt
from app.models.task import Task
from app.models.project import Project
from app.models.project_comment import ProjectComment


class TaskRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(
        self,
        search: Optional[str] = None,
        project_id: Optional[str] = None,
        assignee_id: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        assigned_to_member_id: Optional[str] = None,  # Dev member visibility filter (employee ID)
    ) -> int:
        query = select(func.count(Task.id)).join(Project).where(Task.deleted_at.is_(None), Project.deleted_at.is_(None))
        query = self._apply_filters(query, search, project_id, assignee_id, status, date_from, date_to, assigned_to_member_id)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self,
        search: Optional[str] = None,
        project_id: Optional[str] = None,
        assignee_id: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        assigned_to_member_id: Optional[str] = None,  # Dev member visibility filter (employee ID)
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        page: int = 1,
        page_size: int = 100,
    ) -> list[Task]:
        query = select(Task).join(Project).where(Task.deleted_at.is_(None), Project.deleted_at.is_(None))
        query = self._apply_filters(query, search, project_id, assignee_id, status, date_from, date_to, assigned_to_member_id)

        # Apply sorting
        sort_column = getattr(Task, sort_by, Task.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, task_id: str) -> Optional[Task]:
        query = select(Task).where(Task.id == task_id, Task.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_project_id(self, project_id: str) -> list[Task]:
        query = select(Task).where(Task.project_id == project_id, Task.deleted_at.is_(None)).order_by(Task.created_at.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, data: dict) -> Task:
        task = Task(id=str(uuid.uuid4()), **data)
        self.db.add(task)
        await self.db.flush()
        return task

    async def update(self, task: Task, data: dict) -> Task:
        for key, value in data.items():
            setattr(task, key, value)
        task.updated_at = now_pkt()
        await self.db.flush()
        return task

    async def soft_delete(self, task: Task) -> Task:
        task.deleted_at = now_pkt()
        task.updated_at = now_pkt()
        await self.db.flush()
        return task

    async def add_comment(self, task_id: str, author_id: str, text: str, parent_id: Optional[str] = None, project_id: Optional[str] = None) -> ProjectComment:
        comment = ProjectComment(
            id=str(uuid.uuid4()),
            project_id=project_id,
            task_id=task_id,
            parent_id=parent_id,
            author_id=author_id,
            text=text,
        )
        self.db.add(comment)
        await self.db.flush()
        return comment

    async def get_comments(self, task_id: str) -> list[ProjectComment]:
        query = select(ProjectComment).where(ProjectComment.task_id == task_id).order_by(ProjectComment.created_at.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    def _apply_filters(
        self,
        query,
        search,
        project_id,
        assignee_id,
        status,
        date_from,
        date_to,
        assigned_to_member_id,
    ):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Task.title).contains(q),
                    func.lower(Task.description).contains(q),
                )
            )
        if project_id:
            query = query.where(Task.project_id == project_id)
        if assignee_id:
            query = query.where(Task.assignee_id == assignee_id)
        if status:
            query = query.where(Task.status == status)
        if date_from:
            query = query.where(Task.deadline >= date_from)
        if date_to:
            query = query.where(Task.deadline <= date_to)
        if assigned_to_member_id:
            # Dev team member visibility: only tasks actually assigned to
            # them (by employee ID) — being on a project's team no longer
            # implies visibility into every task on that project.
            query = query.where(Task.assignee_id == assigned_to_member_id)
        return query
