from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_owner_user
from app.repositories.settings_repository import SettingsRepository
from app.schemas.settings import CurrencySettingsResponse, CurrencySettingsUpdate
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/api/settings", tags=["Settings"])


def get_settings_service(db: AsyncSession = Depends(get_db)) -> SettingsService:
    return SettingsService(SettingsRepository(db))


@router.get("/currency", response_model=CurrencySettingsResponse)
async def get_currency_settings(
    service: SettingsService = Depends(get_settings_service),
    current_user: dict = Depends(get_current_user),
):
    return await service.get_currency_settings()


@router.put("/currency", response_model=CurrencySettingsResponse)
async def update_currency_settings(
    data: CurrencySettingsUpdate,
    service: SettingsService = Depends(get_settings_service),
    current_user: dict = Depends(get_owner_user),
):
    return await service.update_currency_settings(data.usd_to_pkr_rate, user=current_user.get("user_id", "anonymous"))
