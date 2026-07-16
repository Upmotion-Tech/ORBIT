from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.currency_settings import CurrencySettings


class SettingsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_currency_settings(self) -> CurrencySettings:
        result = await self.db.execute(select(CurrencySettings).where(CurrencySettings.id == 1))
        row = result.scalar_one_or_none()
        if row is None:
            row = CurrencySettings(id=1)
            self.db.add(row)
            await self.db.flush()
        return row

    async def update_currency_settings(self, rate: float, user: str) -> CurrencySettings:
        row = await self.get_currency_settings()
        row.usd_to_pkr_rate = rate
        row.updated_by = user
        await self.db.flush()
        return row
