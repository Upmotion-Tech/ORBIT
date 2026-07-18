from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_roles, get_current_user, get_owner_user
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.employee_service import EmployeeService
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse

router = APIRouter(prefix="/api/employees", tags=["Employees"])


def get_employee_service(db: AsyncSession = Depends(get_db)) -> EmployeeService:
    return EmployeeService(
        employee_repo=EmployeeRepository(db),
        notification_repo=NotificationRepository(db),
        audit_repo=AuditLogRepository(db),
    )


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(
    search: Optional[str] = None,
    department: Optional[str] = None,
    status_filter: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 100,
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    return await service.list_employees(
        search=search, department=department, status_filter=status_filter,
        sort_by=sort_by, sort_dir=sort_dir,
        page=page, page_size=page_size, persona=persona,
    )


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: str,
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    employee = await service.get_employee(employee_id, persona=persona)
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found.",
        )
    return employee


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeCreate,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    return await service.create_employee(
        body.model_dump(),
        user=current_user.get("sub", "anonymous"),
        persona=persona,
    )


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: str,
    body: EmployeeUpdate,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    return await service.update_employee(
        employee_id,
        body.model_dump(exclude_none=True),
        user=current_user.get("sub", "anonymous"),
        persona=persona,
        actor_id=current_user.get("user_id"),
    )


@router.post("/{employee_id}/deactivate", response_model=EmployeeResponse)
async def deactivate_employee_account(
    employee_id: str,
    current_user: dict = Depends(get_owner_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    return await service.set_account_active(
        employee_id, is_active=False,
        user=current_user.get("sub", "anonymous"),
        actor_id=current_user.get("user_id"),
        persona=persona,
    )


@router.post("/{employee_id}/activate", response_model=EmployeeResponse)
async def activate_employee_account(
    employee_id: str,
    current_user: dict = Depends(get_owner_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    return await service.set_account_active(
        employee_id, is_active=True,
        user=current_user.get("sub", "anonymous"),
        persona=persona,
    )


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    await service.delete_employee(employee_id, persona=persona, user=current_user.get("sub", "anonymous"))
