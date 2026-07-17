from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_owner_user
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.expense_service import ExpenseService
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse

router = APIRouter(prefix="/api/finance/expenses", tags=["Expenses"])

def get_expense_service(db: AsyncSession = Depends(get_db)) -> ExpenseService:
    return ExpenseService(
        expense_repo=ExpenseRepository(db),
        notification_repo=NotificationRepository(db),
        audit_repo=AuditLogRepository(db),
    )

def _map_expense_response(exp) -> ExpenseResponse:
    resp = ExpenseResponse.model_validate(exp)
    resp.submitted_by_name = exp.submitted_by.name if exp.submitted_by else "Unknown"
    return resp

@router.get("", response_model=list[ExpenseResponse])
async def list_expenses(
    search: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 100,
    service: ExpenseService = Depends(get_expense_service),
    current_user: dict = Depends(get_current_user),
):
    expenses = await service.list_expenses(
        search=search, status=status, department=department, category=category,
        date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir, page=page, page_size=page_size
    )
    return [_map_expense_response(e) for e in expenses]

@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    expense_id: str,
    service: ExpenseService = Depends(get_expense_service),
    current_user: dict = Depends(get_current_user),
):
    exp = await service.get_expense(expense_id)
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")
    return _map_expense_response(exp)

@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    body: ExpenseCreate,
    service: ExpenseService = Depends(get_expense_service),
    current_user: dict = Depends(get_current_user),
):
    exp = await service.create_expense(body.model_dump(), user=current_user.get("sub", "anonymous"))
    return _map_expense_response(exp)

@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    body: ExpenseUpdate,
    service: ExpenseService = Depends(get_expense_service),
    current_user: dict = Depends(get_current_user),
):
    exp = await service.update_expense(
        expense_id,
        body.model_dump(exclude_none=True),
        user=current_user.get("sub", "anonymous")
    )
    return _map_expense_response(exp)

@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    service: ExpenseService = Depends(get_expense_service),
    current_user: dict = Depends(get_owner_user),
):
    await service.delete_expense(expense_id, user=current_user.get("sub", "anonymous"))
