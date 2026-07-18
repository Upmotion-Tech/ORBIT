from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_roles
from app.repositories.expense_category_repository import ExpenseCategoryRepository
from app.services.expense_category_service import ExpenseCategoryService
from app.schemas.expense_category import ExpenseCategoryCreate, ExpenseCategoryResponse

router = APIRouter(prefix="/api/settings/finance/expense-categories", tags=["Expense Categories"])


def get_category_service(db: AsyncSession = Depends(get_db)) -> ExpenseCategoryService:
    return ExpenseCategoryService(category_repo=ExpenseCategoryRepository(db))


@router.get("", response_model=list[ExpenseCategoryResponse])
async def list_expense_categories(
    service: ExpenseCategoryService = Depends(get_category_service),
):
    return await service.list_categories()


@router.post("", response_model=ExpenseCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_expense_category(
    body: ExpenseCategoryCreate,
    persona: list = Depends(get_persona_roles),
    service: ExpenseCategoryService = Depends(get_category_service),
):
    return await service.create_category(body.name, persona=persona)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense_category(
    category_id: str,
    persona: list = Depends(get_persona_roles),
    service: ExpenseCategoryService = Depends(get_category_service),
):
    await service.delete_category(category_id, persona=persona)
