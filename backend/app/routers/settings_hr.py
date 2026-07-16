from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_roles, get_current_user
from app.repositories.leave_policy_repository import LeavePolicyRepository
from app.repositories.holiday_repository import HolidayRepository
from app.services.leave_policy_service import LeavePolicyService
from app.services.holiday_service import HolidayService
from app.schemas.leave_policy import LeavePolicyUpdate, LeavePolicyResponse
from app.schemas.holiday import HolidayCreate, HolidayResponse

router = APIRouter(prefix="/api/settings/hr", tags=["HR Settings"])


def get_policy_service(db: AsyncSession = Depends(get_db)) -> LeavePolicyService:
    return LeavePolicyService(
        policy_repo=LeavePolicyRepository(db),
    )


def get_holiday_service(db: AsyncSession = Depends(get_db)) -> HolidayService:
    return HolidayService(
        holiday_repo=HolidayRepository(db),
    )


@router.get("/leave-policy", response_model=LeavePolicyResponse)
async def get_leave_policy(
    service: LeavePolicyService = Depends(get_policy_service),
):
    return await service.get_policy()


@router.put("/leave-policy", response_model=LeavePolicyResponse)
async def update_leave_policy(
    body: LeavePolicyUpdate,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: LeavePolicyService = Depends(get_policy_service),
):
    return await service.update_policy(
        body.model_dump(),
        user=current_user.get("sub", "anonymous"),
        persona=persona,
    )


@router.get("/holidays", response_model=list[HolidayResponse])
async def list_holidays(
    service: HolidayService = Depends(get_holiday_service),
):
    return await service.list_holidays()


@router.post("/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    body: HolidayCreate,
    persona: list = Depends(get_persona_roles),
    service: HolidayService = Depends(get_holiday_service),
):
    return await service.create_holiday(body.model_dump(), persona=persona)


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday(
    holiday_id: str,
    persona: list = Depends(get_persona_roles),
    service: HolidayService = Depends(get_holiday_service),
):
    await service.delete_holiday(holiday_id, persona=persona)
