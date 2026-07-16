from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.repositories.currency_preference_repository import CurrencyPreferenceRepository
from app.schemas.currency_preference import CurrencyPreferenceResponse, CurrencyPreferenceUpdate
from app.services.currency_preference_service import CurrencyPreferenceService

router = APIRouter(prefix="/api/preferences", tags=["Preferences"])


def get_preference_service(db: AsyncSession = Depends(get_db)) -> CurrencyPreferenceService:
    return CurrencyPreferenceService(CurrencyPreferenceRepository(db))


@router.get("/currency/{user_id}", response_model=dict[str, str])
async def get_currency_preferences(
    user_id: str,
    service: CurrencyPreferenceService = Depends(get_preference_service),
):
    return await service.get_all_for_user(user_id)


@router.put("/currency/{user_id}", response_model=CurrencyPreferenceResponse)
async def set_currency_preference(
    user_id: str,
    data: CurrencyPreferenceUpdate,
    service: CurrencyPreferenceService = Depends(get_preference_service),
):
    return await service.set_preference(user_id, data.module, data.currency)
