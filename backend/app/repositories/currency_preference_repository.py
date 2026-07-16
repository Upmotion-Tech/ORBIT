from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.currency_preference import CurrencyPreference


class CurrencyPreferenceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_for_user(self, user_id: str) -> list[CurrencyPreference]:
        result = await self.db.execute(
            select(CurrencyPreference).where(CurrencyPreference.user_id == user_id)
        )
        return list(result.scalars().all())

    async def upsert(self, user_id: str, module: str, currency: str) -> CurrencyPreference:
        result = await self.db.execute(
            select(CurrencyPreference).where(
                CurrencyPreference.user_id == user_id,
                CurrencyPreference.module == module,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = CurrencyPreference(user_id=user_id, module=module, currency=currency)
            self.db.add(row)
        else:
            row.currency = currency
        await self.db.flush()
        return row
