from datetime import date
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.holiday import Holiday


class HolidayRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all(self) -> list[Holiday]:
        query = select(Holiday).order_by(Holiday.date.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, holiday_id: str) -> Optional[Holiday]:
        query = select(Holiday).where(Holiday.id == holiday_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> Holiday:
        holiday = Holiday(**data)
        self.db.add(holiday)
        await self.db.flush()
        await self.db.refresh(holiday)
        return holiday

    async def update(self, holiday: Holiday, data: dict) -> Holiday:
        for key, value in data.items():
            setattr(holiday, key, value)
        await self.db.flush()
        await self.db.refresh(holiday)
        return holiday

    async def find_overlapping(self, start: date, end: date) -> list[Holiday]:
        """Holidays whose [date, end_date-or-date] range overlaps [start, end]
        — used both to block attendance marking on a holiday and to find
        which past holiday(s) a retroactively-added holiday now covers."""
        query = select(Holiday).where(
            Holiday.date <= end,
            func.coalesce(Holiday.end_date, Holiday.date) >= start,
        ).order_by(Holiday.date.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def delete(self, holiday: Holiday) -> None:
        await self.db.delete(holiday)
        await self.db.flush()
