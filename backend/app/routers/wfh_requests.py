from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_persona_roles
from app.repositories.wfh_request_repository import WfhRequestRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.attendance_repository import AttendanceRepository
from app.services.wfh_request_service import WfhRequestService
from app.schemas.wfh_request import WfhRequestCreate, WfhRequestUpdate, WfhDecision, WfhRequestResponse

router = APIRouter(prefix="/api/wfh", tags=["Work From Home"])


def get_wfh_service(db: AsyncSession = Depends(get_db)) -> WfhRequestService:
    return WfhRequestService(
        WfhRequestRepository(db),
        EmployeeRepository(db),
        NotificationRepository(db),
        AttendanceRepository(db),
    )


@router.post("/mine", response_model=WfhRequestResponse)
async def create_wfh_request(
    body: WfhRequestCreate,
    current_user: dict = Depends(get_current_user),
    service: WfhRequestService = Depends(get_wfh_service),
):
    return await service.create_request(
        current_user.get("user_id"), body.date, body.description,
        user=current_user.get("user_id", "anonymous"),
        end_day=body.end_date,
        half_day=body.half_day,
    )


@router.get("/mine", response_model=list[WfhRequestResponse])
async def get_my_wfh_requests(
    current_user: dict = Depends(get_current_user),
    service: WfhRequestService = Depends(get_wfh_service),
):
    return await service.list_my_requests(current_user.get("user_id"))


@router.get("", response_model=list[WfhRequestResponse])
async def get_all_wfh_requests(
    status_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    service: WfhRequestService = Depends(get_wfh_service),
):
    return await service.list_all_requests(status_filter)


@router.put("/{request_id}", response_model=WfhRequestResponse)
async def update_own_wfh_request(
    request_id: str,
    body: WfhRequestUpdate,
    current_user: dict = Depends(get_current_user),
    service: WfhRequestService = Depends(get_wfh_service),
):
    # Applicant's own self-service edit — no approver dependency, since the
    # service scopes it to requests they own that are still Pending.
    # exclude_unset so an omitted field stays as-is, while an explicit
    # end_date: null really does clear it back to a single-day request.
    return await service.update_own_request(
        request_id,
        body.model_dump(exclude_unset=True),
        current_user.get("user_id", ""),
    )


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_own_wfh_request(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    service: WfhRequestService = Depends(get_wfh_service),
):
    await service.delete_own_request(request_id, current_user.get("user_id", ""))


@router.post("/{request_id}/approve", response_model=WfhRequestResponse)
async def approve_wfh_request(
    request_id: str,
    body: WfhDecision,
    current_user: dict = Depends(get_current_user),
    persona_roles: list = Depends(get_persona_roles),
    service: WfhRequestService = Depends(get_wfh_service),
):
    return await service.approve_request(
        request_id, body.note, current_user.get("user_id"), persona=persona_roles,
    )


@router.post("/{request_id}/reject", response_model=WfhRequestResponse)
async def reject_wfh_request(
    request_id: str,
    body: WfhDecision,
    current_user: dict = Depends(get_current_user),
    persona_roles: list = Depends(get_persona_roles),
    service: WfhRequestService = Depends(get_wfh_service),
):
    return await service.reject_request(
        request_id, body.note, current_user.get("user_id"), persona=persona_roles,
    )

