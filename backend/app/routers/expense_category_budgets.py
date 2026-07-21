from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_persona_roles
from app.repositories.expense_category_budget_repository import ExpenseCategoryBudgetRepository
from app.services.expense_category_budget_service import ExpenseCategoryBudgetService
from app.schemas.expense_category_budget import ExpenseCategoryBudgetResponse, ExpenseCategoryBudgetUpdate

router = APIRouter(prefix="/api/finance/expense-category-budgets", tags=["Expense Category Budgets"])


def get_service(db: AsyncSession = Depends(get_db)) -> ExpenseCategoryBudgetService:
    return ExpenseCategoryBudgetService(db, ExpenseCategoryBudgetRepository(db))


@router.get("", response_model=list[ExpenseCategoryBudgetResponse])
async def list_expense_category_budgets(
    current_user: dict = Depends(get_current_user),
    service: ExpenseCategoryBudgetService = Depends(get_service),
):
    return await service.list_budgets()


@router.put("/{category}", response_model=ExpenseCategoryBudgetResponse)
async def set_expense_category_budget(
    category: str,
    body: ExpenseCategoryBudgetUpdate,
    current_user: dict = Depends(get_current_user),
    persona: list = Depends(get_persona_roles),
    service: ExpenseCategoryBudgetService = Depends(get_service),
):
    return await service.set_budget(
        category, body.monthly_budget_usd,
        user=current_user.get("user_id", "anonymous"),
        persona=persona,
    )
