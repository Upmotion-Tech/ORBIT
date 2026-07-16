from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings import CurrencySettingsResponse


class SettingsService:
    def __init__(self, settings_repo: SettingsRepository):
        self.settings_repo = settings_repo

    async def get_currency_settings(self) -> CurrencySettingsResponse:
        row = await self.settings_repo.get_currency_settings()
        return CurrencySettingsResponse.model_validate(row)

    async def update_currency_settings(self, rate: float, user: str) -> CurrencySettingsResponse:
        row = await self.settings_repo.update_currency_settings(rate, user)
        return CurrencySettingsResponse.model_validate(row)
