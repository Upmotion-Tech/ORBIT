import asyncio
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_finance_user
from app.repositories.salary_slip_repository import SalarySlipRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.tax_slab_repository import TaxSlabRepository
from app.services.salary_slip_service import SalarySlipService
from app.services.tax_slab_service import TaxSlabService
from app.schemas.salary_slip import SalarySlipCreate, SalarySlipUpdate, SalarySlipResponse
from app.core.time import now_pkt

router = APIRouter(prefix="/api/finance/payroll", tags=["Payroll"])

def get_slip_service(db: AsyncSession = Depends(get_db)) -> SalarySlipService:
    return SalarySlipService(
        slip_repo=SalarySlipRepository(db),
        notification_repo=NotificationRepository(db),
        tax_slab_service=TaxSlabService(TaxSlabRepository(db)),
        employee_repo=EmployeeRepository(db),
    )

def _is_finance(current_user: dict) -> bool:
    roles = current_user.get("roles") or []
    return any(r in ("owner", "finance") for r in roles)

def _map_slip_response(slip) -> SalarySlipResponse:
    resp = SalarySlipResponse.model_validate(slip)
    resp.employee_name = slip.employee.name if slip.employee else "Unknown"
    resp.employee_role = slip.employee.role if slip.employee else "Unknown"
    resp.employee_department = slip.employee.department if slip.employee else "Unknown"
    return resp

@router.get("", response_model=list[SalarySlipResponse])
async def list_payroll_slips(
    month: Optional[str] = None,
    search: Optional[str] = None,
    department: Optional[str] = None,
    payment_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_finance_user),
):
    if not month:
        month = now_pkt().date().strftime("%Y-%m")

    # 1. Fetch all active employees matching filters
    emp_repo = EmployeeRepository(db)
    employees = await emp_repo.find_all(search=search, department=department, status_filter="Active")

    # 2. Get or create slip for each employee
    slips = []
    actor_id = current_user.get("user_id", "anonymous")
    for emp in employees:
        slip = await service.get_or_create_slip(emp.id, month, emp.salary, user=actor_id)
        # Verify status matches filter
        if payment_status and slip.payment_status != payment_status:
            continue
        slips.append(slip)

    # Commit the initialized slips if any
    await db.commit()

    return [_map_slip_response(s) for s in slips]

@router.get("/me", response_model=list[SalarySlipResponse])
async def list_my_payroll_slips(
    limit: int = 24,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_current_user),
):
    slips = await service.list_my_slips(current_user.get("user_id"), limit=limit)
    return [_map_slip_response(s) for s in slips]

@router.post("/generate-slips")
async def generate_salary_slips(
    month: Optional[str] = None,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_finance_user),
):
    if not month:
        month = now_pkt().date().strftime("%Y-%m")
    count = await service.generate_slips_for_month(month, user=current_user.get("user_id", "anonymous"))
    return {"month": month, "employees_notified": count}

@router.post("/mark-all-paid")
async def mark_all_salary_slips_paid(
    month: Optional[str] = None,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_finance_user),
):
    if not month:
        month = now_pkt().date().strftime("%Y-%m")
    result = await service.mark_all_paid_for_month(month, user=current_user.get("user_id", "anonymous"))
    return {"month": month, "marked_paid": result["count"], "total_net_paid": result["total_net"]}

@router.get("/{slip_id}", response_model=SalarySlipResponse)
async def get_salary_slip(
    slip_id: str,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_current_user),
):
    slip = await service.get_slip(slip_id)
    if not slip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")
    if slip.employee_id != current_user.get("user_id") and not _is_finance(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own salary slip.")
    return _map_slip_response(slip)

@router.get("/{slip_id}/pdf")
async def get_salary_slip_pdf(
    slip_id: str,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_current_user),
):
    slip = await service.get_slip(slip_id)
    if not slip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")
    if slip.employee_id != current_user.get("user_id") and not _is_finance(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only view your own salary slip.")
    # reportlab PDF generation is synchronous, CPU-bound work — run it off
    # the event loop so it doesn't stall other requests while it builds.
    pdf_bytes, filename = await asyncio.get_event_loop().run_in_executor(
        None, service.generate_pdf, slip
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.post("/{slip_id}/generate", response_model=SalarySlipResponse)
async def generate_single_salary_slip(
    slip_id: str,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_finance_user),
):
    slip = await service.generate_single_slip(slip_id, user=current_user.get("user_id", "anonymous"))
    return _map_slip_response(slip)

@router.put("/{slip_id}", response_model=SalarySlipResponse)
async def update_salary_slip(
    slip_id: str,
    body: SalarySlipUpdate,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_finance_user),
):
    slip = await service.update_slip(
        slip_id,
        body.model_dump(exclude_none=True),
        user=current_user.get("user_id", "anonymous"),
        is_owner=current_user.get("department") == "Owner",
    )
    return _map_slip_response(slip)

@router.post("/{slip_id}/reset-tax", response_model=SalarySlipResponse)
async def reset_salary_slip_tax(
    slip_id: str,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_finance_user),
):
    if current_user.get("department") != "Owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Owner department can reset Income Tax back to auto-calculated.",
        )
    slip = await service.reset_tax_to_auto(slip_id, user=current_user.get("user_id", "anonymous"))
    return _map_slip_response(slip)

@router.delete("/{slip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_salary_slip(
    slip_id: str,
    service: SalarySlipService = Depends(get_slip_service),
    current_user: dict = Depends(get_finance_user),
):
    await service.delete_slip(slip_id)
