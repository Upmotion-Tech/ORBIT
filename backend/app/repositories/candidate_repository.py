from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hiring_candidate import HiringCandidate


class CandidateRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_opening_id(self, opening_id: str) -> list[HiringCandidate]:
        query = (
            select(HiringCandidate)
            .where(HiringCandidate.opening_id == opening_id)
            .order_by(HiringCandidate.applied_date.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, candidate_id: str) -> Optional[HiringCandidate]:
        query = select(HiringCandidate).where(HiringCandidate.id == candidate_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def count_by_opening_id(self, opening_id: str) -> int:
        query = select(func.count(HiringCandidate.id)).where(
            HiringCandidate.opening_id == opening_id,
        )
        result = await self.db.execute(query)
        return result.scalar_one()

    async def create(self, data: dict) -> HiringCandidate:
        candidate = HiringCandidate(**data)
        self.db.add(candidate)
        await self.db.flush()
        await self.db.refresh(candidate)
        return candidate

    async def update(self, candidate: HiringCandidate, data: dict) -> HiringCandidate:
        for key, value in data.items():
            setattr(candidate, key, value)
        await self.db.flush()
        await self.db.refresh(candidate)
        return candidate
