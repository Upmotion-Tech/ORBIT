from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leave_policy import LeavePolicy


class LeavePolicyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_current(self) -> Optional[LeavePolicy]:
        query = select(LeavePolicy).order_by(LeavePolicy.year.desc()).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_year(self, year: int) -> Optional[LeavePolicy]:
        query = select(LeavePolicy).where(LeavePolicy.year == year)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def upsert(self, data: dict) -> LeavePolicy:
        year = data.get("year")
        existing = await self.get_by_year(year)
        if existing:
            for key, value in data.items():
                if key != "year":
                    setattr(existing, key, value)
            await self.db.flush()
            await self.db.refresh(existing)
            return existing
        policy = LeavePolicy(**data)
        self.db.add(policy)
        await self.db.flush()
        await self.db.refresh(policy)
        return policy
