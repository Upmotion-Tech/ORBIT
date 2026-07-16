import uuid
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead_activity import LeadActivity


class ActivityRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count_by_lead(self, lead_id: str) -> int:
        query = select(func.count(LeadActivity.id)).where(LeadActivity.lead_id == lead_id)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_by_lead(
        self,
        lead_id: str,
        page: int = 1,
        page_size: int = 50,
    ) -> list[LeadActivity]:
        query = (
            select(LeadActivity)
            .where(LeadActivity.lead_id == lead_id)
            .order_by(LeadActivity.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, data: dict) -> LeadActivity:
        activity = LeadActivity(id=str(uuid.uuid4()), **data)
        self.db.add(activity)
        await self.db.flush()
        return activity
