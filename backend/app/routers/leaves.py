from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_roles, get_current_user
from app.repositories.leave_repository import LeaveRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.leave_policy_repository import LeavePolicyRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.leave_service import LeaveService
from app.schemas.leave import LeaveCreate, LeaveUpdate, LeaveApproval, LeaveResponse, LeaveBalanceResponse

router = APIRouter(prefix="/api/leaves", tags=["Leaves"])


def get_leave_service(db: AsyncSession = Depends(get_db)) -> LeaveService:
    return LeaveService(
        leave_repo=LeaveRepository(db),
        employee_repo=EmployeeRepository(db),
        leave_policy_repo=LeavePolicyRepository(db),
        notification_repo=NotificationRepository(db),
        audit_repo=AuditLogRepository(db),
    )


@router.get("", response_model=list[LeaveResponse])
async def list_leaves(
    employee_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    leave_type: Optional[str] = None,
    sort_by: str = "applied_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 100,
    service: LeaveService = Depends(get_leave_service),
):
    return await service.list_leave_requests(
        employee_id=employee_id, status_filter=status_filter,
        leave_type=leave_type, sort_by=sort_by, sort_dir=sort_dir,
        page=page, page_size=page_size,
    )


@router.get("/balance/{employee_id}", response_model=LeaveBalanceResponse)
async def get_leave_balance(
    employee_id: str,
    service: LeaveService = Depends(get_leave_service),
):
    return await service.get_balance(employee_id)


@router.get("/{leave_id}", response_model=LeaveResponse)
async def get_leave(
    leave_id: str,
    service: LeaveService = Depends(get_leave_service),
):
    leave = await service.get_leave(leave_id)
    if not leave:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Leave request not found.",
        )
    return leave


@router.post("", response_model=LeaveResponse, status_code=status.HTTP_201_CREATED)
async def create_leave(
    body: LeaveCreate,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: LeaveService = Depends(get_leave_service),
):
    return await service.create_leave(
        body.model_dump(),
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
    )


@router.put("/{leave_id}", response_model=LeaveResponse)
async def update_own_leave(
    leave_id: str,
    body: LeaveUpdate,
    current_user: dict = Depends(get_current_user),
    service: LeaveService = Depends(get_leave_service),
):
    # No HR/Owner/manager dependency here on purpose — this is the
    # applicant's own self-service edit, and the service scopes it to
    # requests they own that are still Pending. exclude_unset so omitting a
    # field leaves it as-is, while explicitly sending end_date: null really
    # does clear it back to a single-day request.
    return await service.update_own_leave(
        leave_id,
        body.model_dump(exclude_unset=True),
        current_user.get("user_id", ""),
    )


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_own_leave(
    leave_id: str,
    current_user: dict = Depends(get_current_user),
    service: LeaveService = Depends(get_leave_service),
):
    await service.delete_own_leave(leave_id, current_user.get("user_id", ""))


@router.post("/{leave_id}/approve", response_model=LeaveResponse)
async def approve_leave(
    leave_id: str,
    body: LeaveApproval,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: LeaveService = Depends(get_leave_service),
):
    return await service.approve_leave(
        leave_id,
        note=body.note,
        approved_by=current_user.get("user_id"),
        persona=persona,
    )


@router.post("/{leave_id}/reject", response_model=LeaveResponse)
async def reject_leave(
    leave_id: str,
    body: LeaveApproval,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: LeaveService = Depends(get_leave_service),
):
    return await service.reject_leave(
        leave_id,
        rejection_reason=body.rejection_reason,
        rejected_by=current_user.get("user_id"),
        persona=persona,
    )
