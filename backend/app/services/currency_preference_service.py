from app.repositories.currency_preference_repository import CurrencyPreferenceRepository
from app.schemas.currency_preference import CurrencyPreferenceResponse


class CurrencyPreferenceService:
    def __init__(self, repo: CurrencyPreferenceRepository):
        self.repo = repo

    async def get_all_for_user(self, user_id: str) -> dict[str, str]:
        rows = await self.repo.get_all_for_user(user_id)
        return {row.module: row.currency for row in rows}

    async def set_preference(self, user_id: str, module: str, currency: str) -> CurrencyPreferenceResponse:
        row = await self.repo.upsert(user_id, module, currency)
        return CurrencyPreferenceResponse(module=row.module, currency=row.currency)
