import uuid
from datetime import date
from typing import Optional

from sqlalchemy import select, func, or_, and_, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.time import now_pkt
from app.models.project import Project
from app.models.project_comment import ProjectComment
from app.models.project_attachment import ProjectAttachment


class ProjectRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(
        self,
        search: Optional[str] = None,
        client: Optional[str] = None,
        status: Optional[str] = None,
        team_member: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        assigned_to_member: Optional[str] = None,  # Dev member visibility filter
    ) -> int:
        query = select(func.count(Project.id)).where(Project.deleted_at.is_(None))
        query = self._apply_filters(query, search, client, status, team_member, date_from, date_to, assigned_to_member)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self,
        search: Optional[str] = None,
        client: Optional[str] = None,
        status: Optional[str] = None,
        team_member: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        assigned_to_member: Optional[str] = None,  # Dev member visibility filter
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        page: int = 1,
        page_size: int = 100,
    ) -> list[Project]:
        query = select(Project).where(Project.deleted_at.is_(None))
        query = self._apply_filters(query, search, client, status, team_member, date_from, date_to, assigned_to_member)

        # Apply sorting
        sort_column = getattr(Project, sort_by, Project.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, project_id: str) -> Optional[Project]:
        query = select(Project).where(Project.id == project_id, Project.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_lead_id(self, lead_id: str) -> Optional[Project]:
        query = select(Project).where(Project.lead_id == lead_id, Project.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_name(self, name: str) -> Optional[Project]:
        query = select(Project).where(func.lower(Project.name) == func.lower(name), Project.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> Project:
        project = Project(id=str(uuid.uuid4()), **data)
        self.db.add(project)
        await self.db.flush()
        return project

    async def update(self, project: Project, data: dict) -> Project:
        for key, value in data.items():
            setattr(project, key, value)
        project.updated_at = now_pkt()
        await self.db.flush()
        return project

    async def soft_delete(self, project: Project) -> Project:
        project.deleted_at = now_pkt()
        project.updated_at = now_pkt()
        await self.db.flush()
        return project

    async def add_attachment(self, project_id: str, filename: str, url: str, size_bytes: int, uploaded_by: str) -> ProjectAttachment:
        attachment = ProjectAttachment(
            id=str(uuid.uuid4()),
            project_id=project_id,
            filename=filename,
            url=url,
            size_bytes=size_bytes,
            uploaded_by=uploaded_by,
        )
        self.db.add(attachment)
        await self.db.flush()
        return attachment

    async def get_attachments(self, project_id: str) -> list[ProjectAttachment]:
        query = select(ProjectAttachment).where(ProjectAttachment.project_id == project_id).order_by(ProjectAttachment.created_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_attachment_by_id_and_filename(self, project_id: str, filename: str) -> Optional[ProjectAttachment]:
        query = select(ProjectAttachment).where(ProjectAttachment.project_id == project_id, ProjectAttachment.filename == filename)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def delete_attachment(self, attachment: ProjectAttachment) -> None:
        await self.db.delete(attachment)
        await self.db.flush()

    async def add_comment(self, project_id: str, author: str, text: str, parent_id: Optional[str] = None, task_id: Optional[str] = None) -> ProjectComment:
        comment = ProjectComment(
            id=str(uuid.uuid4()),
            project_id=project_id,
            task_id=task_id,
            parent_id=parent_id,
            author=author,
            text=text,
        )
        self.db.add(comment)
        await self.db.flush()
        return comment

    async def get_comments(self, project_id: str) -> list[ProjectComment]:
        query = select(ProjectComment).where(ProjectComment.project_id == project_id, ProjectComment.task_id.is_(None)).order_by(ProjectComment.created_at.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    def _apply_filters(
        self,
        query,
        search,
        client,
        status,
        team_member,
        date_from,
        date_to,
        assigned_to_member,
    ):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Project.name).contains(q),
                    func.lower(Project.client).contains(q),
                    func.lower(Project.description).contains(q),
                )
            )
        if client:
            query = query.where(Project.client == client)
        if status:
            query = query.where(Project.status == status)
        if team_member:
            # Project.team_ids is a JSON column of employee UUIDs.
            # Cast to text for LIKE matching (works identically on Postgres and SQLite).
            query = query.where(cast(Project.team_ids, String).like(f'%"{team_member}"%'))
        if date_from:
            query = query.where(Project.deadline >= date_from)
        if date_to:
            query = query.where(Project.deadline <= date_to)
        if assigned_to_member:
            # Dev team member only sees projects they are assigned to (by employee ID)
            query = query.where(cast(Project.team_ids, String).like(f'%"{assigned_to_member}"%'))
        return query
