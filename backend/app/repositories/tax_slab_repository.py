from typing import Optional

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tax_slab import TaxSlab


class TaxSlabRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all(self) -> list[TaxSlab]:
        result = await self.db.execute(select(TaxSlab).order_by(TaxSlab.min_salary.asc()))
        return list(result.scalars().all())

    async def find_by_id(self, slab_id: str) -> Optional[TaxSlab]:
        result = await self.db.execute(select(TaxSlab).where(TaxSlab.id == slab_id))
        return result.scalar_one_or_none()

    async def find_active_matching_salary(self, annual_salary: float) -> Optional[TaxSlab]:
        query = select(TaxSlab).where(
            TaxSlab.active.is_(True),
            TaxSlab.min_salary <= annual_salary,
            or_(TaxSlab.max_salary.is_(None), TaxSlab.max_salary >= annual_salary),
        ).order_by(TaxSlab.min_salary.desc())
        result = await self.db.execute(query)
        return result.scalars().first()

    async def find_overlapping_active(self, min_salary: float, max_salary: Optional[float], exclude_id: Optional[str] = None) -> list[TaxSlab]:
        # Two ranges [a_min, a_max] and [b_min, b_max] (either max may be
        # unbounded/None) overlap iff a_min <= b_max and b_min <= a_max —
        # branched in Python rather than embedded in the SQL expression,
        # since `max_salary is None` is a plain Python bool, not a per-row
        # SQL condition.
        conditions = [TaxSlab.active.is_(True)]
        if max_salary is not None:
            conditions.append(TaxSlab.min_salary <= max_salary)
        conditions.append(or_(TaxSlab.max_salary.is_(None), TaxSlab.max_salary >= min_salary))
        query = select(TaxSlab).where(*conditions)
        if exclude_id:
            query = query.where(TaxSlab.id != exclude_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_open_ended_active(self, exclude_id: Optional[str] = None) -> int:
        query = select(TaxSlab).where(TaxSlab.active.is_(True), TaxSlab.max_salary.is_(None))
        if exclude_id:
            query = query.where(TaxSlab.id != exclude_id)
        result = await self.db.execute(query)
        return len(list(result.scalars().all()))

    async def create(self, data: dict) -> TaxSlab:
        slab = TaxSlab(**data)
        self.db.add(slab)
        await self.db.flush()
        await self.db.refresh(slab)
        return slab

    async def update(self, slab: TaxSlab, data: dict) -> TaxSlab:
        for key, value in data.items():
            setattr(slab, key, value)
        await self.db.flush()
        await self.db.refresh(slab)
        return slab

    async def delete(self, slab: TaxSlab) -> None:
        await self.db.delete(slab)
        await self.db.flush()
