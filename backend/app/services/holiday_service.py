from typing import Optional

from fastapi import HTTPException, status

from app.repositories.holiday_repository import HolidayRepository
from app.schemas.holiday import HolidayCreate, HolidayResponse
from app.models.holiday import Holiday
from app.core.permissions import has_role


class HolidayService:
    def __init__(
        self,
        holiday_repo: HolidayRepository,
    ):
        self.holiday_repo = holiday_repo

    async def list_holidays(self) -> list[HolidayResponse]:
        holidays = await self.holiday_repo.find_all()
        return [HolidayResponse.model_validate(h) for h in holidays]

    async def create_holiday(self, data: dict, persona=None) -> HolidayResponse:
        if not has_role(persona, "hr", "hr_admin", "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR or Owner can add holidays.",
            )

        holiday = await self.holiday_repo.create(data)
        return HolidayResponse.model_validate(holiday)

    async def delete_holiday(self, holiday_id: str, persona=None) -> None:
        if not has_role(persona, "hr", "hr_admin", "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR or Owner can delete holidays.",
            )

        holiday = await self.holiday_repo.find_by_id(holiday_id)
        if not holiday:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Holiday not found.",
            )

        await self.holiday_repo.delete(holiday)
