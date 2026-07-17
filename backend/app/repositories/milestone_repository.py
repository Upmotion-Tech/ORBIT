from datetime import date
from typing import Optional
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.core.time import now_pkt
from app.models.milestone import Milestone
from app.models.project import Project

class MilestoneRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _apply_filters(
        self,
        query,
        search: Optional[str] = None,
        status: Optional[str] = None,
        project_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Milestone.name).contains(q),
                    func.lower(Project.name).contains(q),
                )
            )
        if status:
            query = query.where(Milestone.status == status)
        if project_id:
            query = query.where(Milestone.project_id == project_id)
        if date_from:
            query = query.where(Milestone.expected_date >= date_from)
        if date_to:
            query = query.where(Milestone.expected_date <= date_to)
        return query

    async def count(
        self,
        search: Optional[str] = None,
        status: Optional[str] = None,
        project_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> int:
        query = select(func.count(Milestone.id)).join(Milestone.project).where(Milestone.deleted_at.is_(None))
        query = self._apply_filters(query, search, status, project_id, date_from, date_to)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self,
        search: Optional[str] = None,
        status: Optional[str] = None,
        project_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        page: int = 1,
        page_size: int = 100,
    ) -> list[Milestone]:
        query = select(Milestone).join(Milestone.project).options(joinedload(Milestone.project)).where(Milestone.deleted_at.is_(None))
        query = self._apply_filters(query, search, status, project_id, date_from, date_to)

        # Apply sorting
        sort_column = getattr(Milestone, sort_by, Milestone.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, milestone_id: str) -> Optional[Milestone]:
        query = select(Milestone).options(joinedload(Milestone.project)).where(
            Milestone.id == milestone_id,
            Milestone.deleted_at.is_(None)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> Milestone:
        milestone = Milestone(**data)
        self.db.add(milestone)
        await self.db.flush()
        # Load relationships
        query = select(Milestone).options(joinedload(Milestone.project)).where(Milestone.id == milestone.id)
        res = await self.db.execute(query)
        return res.scalar_one()

    async def update(self, milestone: Milestone, data: dict) -> Milestone:
        for key, value in data.items():
            setattr(milestone, key, value)
        await self.db.flush()
        # Same MissingGreenlet risk as invoice/expense/job_opening repos had:
        # a bare refresh() expires `project` without reloading it.
        return await self.find_by_id(milestone.id)

    async def soft_delete(self, milestone: Milestone) -> None:
        milestone.deleted_at = now_pkt()
        await self.db.flush()
