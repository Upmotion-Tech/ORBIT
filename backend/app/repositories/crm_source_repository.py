import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crm_source import CrmSource

DEFAULT_SOURCES = ["Referral", "Website", "LinkedIn", "Cold outreach", "Instagram"]


class CrmSourceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all(self) -> list[CrmSource]:
        result = await self.db.execute(
            select(CrmSource).order_by(CrmSource.created_at.asc())
        )
        sources = list(result.scalars().all())
        if not sources:
            for name in DEFAULT_SOURCES:
                sources.append(await self.create(name))
        return sources

    async def find_by_name(self, name: str) -> CrmSource | None:
        result = await self.db.execute(
            select(CrmSource).where(CrmSource.name == name)
        )
        return result.scalar_one_or_none()

    async def create(self, name: str) -> CrmSource:
        source = CrmSource(id=str(uuid.uuid4()), name=name)
        self.db.add(source)
        await self.db.flush()
        return source

    async def find_by_id(self, source_id: str) -> CrmSource | None:
        result = await self.db.execute(
            select(CrmSource).where(CrmSource.id == source_id)
        )
        return result.scalar_one_or_none()

    async def delete(self, source: CrmSource) -> None:
        await self.db.delete(source)
        await self.db.flush()

    async def count(self) -> int:
        result = await self.db.execute(select(CrmSource))
        return len(list(result.scalars().all()))
