from typing import Optional

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.job_opening import JobOpening


class JobOpeningRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(self, department=None, status_filter=None) -> int:
        query = select(func.count(JobOpening.id))
        if department:
            query = query.where(JobOpening.department == department)
        if status_filter:
            query = query.where(JobOpening.status == status_filter)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self, department=None, status_filter=None,
        sort_by="opened_at", sort_dir="desc",
    ) -> list[JobOpening]:
        query = (
            select(JobOpening)
            .options(joinedload(JobOpening.candidates))
        )
        if department:
            query = query.where(JobOpening.department == department)
        if status_filter:
            query = query.where(JobOpening.status == status_filter)
        sort_col = getattr(JobOpening, sort_by, JobOpening.opened_at)
        order = sort_col.asc() if sort_dir == "asc" else sort_col.desc()
        query = query.order_by(order)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, opening_id: str) -> Optional[JobOpening]:
        query = (
            select(JobOpening)
            .options(joinedload(JobOpening.candidates))
            .where(JobOpening.id == opening_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> JobOpening:
        opening = JobOpening(**data)
        self.db.add(opening)
        await self.db.flush()
        await self.db.refresh(opening)
        return opening

    async def update(self, opening: JobOpening, data: dict) -> JobOpening:
        for key, value in data.items():
            setattr(opening, key, value)
        await self.db.flush()
        await self.db.refresh(opening)
        return opening
