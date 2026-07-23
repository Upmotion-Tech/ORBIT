import mimetypes
import os
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_roles, get_current_user, get_owner_user
from app.core.permissions import has_role
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.employee_service import EmployeeService
from app.services.email_service import EmailService
from app.services.storage_service import storage_service
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse

router = APIRouter(prefix="/api/employees", tags=["Employees"])


def get_employee_service(db: AsyncSession = Depends(get_db)) -> EmployeeService:
    return EmployeeService(
        employee_repo=EmployeeRepository(db),
        notification_repo=NotificationRepository(db),
        audit_repo=AuditLogRepository(db),
        email_service=EmailService(),
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
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    return await service.create_employee(
        body.model_dump(),
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
        background_tasks=background_tasks,
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
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
        actor_id=current_user.get("user_id"),
    )


@router.post("/{employee_id}/contract", response_model=EmployeeResponse)
async def upload_employee_contract(
    employee_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    MAX_SIZE = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds maximum limit of 10MB.",
        )

    ext = os.path.splitext(file.filename or ".bin")[1].lower()
    if ext not in storage_service.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Allowed file types: {', '.join(storage_service.ALLOWED_EXTENSIONS)}",
        )

    return await service.upload_contract(
        employee_id, content, file.filename or "contract",
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
    )


@router.get("/{employee_id}/contract")
async def get_employee_contract(
    employee_id: str,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    # Owner/HR/Finance can view anyone's contract (same gate as upload/
    # remove); an employee can always view their own — that's the whole
    # point of surfacing this on My Record.
    is_self = current_user.get("user_id") == employee_id
    if not is_self and not has_role(persona, "owner", "hr", "finance"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to view this contract.")

    data, filename = await service.get_contract(employee_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No contract file attached to this employee.")
    ctype, _ = mimetypes.guess_type(filename or "")
    return Response(
        content=data,
        media_type=ctype or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.delete("/{employee_id}/contract", response_model=EmployeeResponse)
async def remove_employee_contract(
    employee_id: str,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    return await service.remove_contract(
        employee_id,
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
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
        user=current_user.get("user_id", "anonymous"),
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
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
    )


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_id: str,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    await service.delete_employee(employee_id, persona=persona, user=current_user.get("user_id", "anonymous"))


@router.delete("/{employee_id}/permanent", status_code=status.HTTP_200_OK)
async def permanently_delete_employee_account(
    employee_id: str,
    current_user: dict = Depends(get_owner_user),
    persona: list = Depends(get_persona_roles),
    service: EmployeeService = Depends(get_employee_service),
):
    name = await service.permanently_delete_employee(
        employee_id,
        user=current_user.get("user_id", "anonymous"),
        actor_id=current_user.get("user_id"),
        persona=persona,
    )
    return {"name": name}
