import uuid
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.time_entry import TimeEntry


class TimeEntryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all(self, project_id: Optional[str] = None) -> list[TimeEntry]:
        query = select(TimeEntry)
        if project_id:
            query = query.where(TimeEntry.project_id == project_id)
        query = query.order_by(TimeEntry.created_at.desc())
        
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, data: dict) -> TimeEntry:
        entry = TimeEntry(id=str(uuid.uuid4()), **data)
        self.db.add(entry)
        await self.db.flush()
        return entry
