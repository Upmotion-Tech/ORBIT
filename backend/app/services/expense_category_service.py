from fastapi import HTTPException, status

from app.repositories.expense_category_repository import ExpenseCategoryRepository
from app.schemas.expense_category import ExpenseCategoryResponse
from app.core.permissions import has_role


class ExpenseCategoryService:
    def __init__(self, category_repo: ExpenseCategoryRepository):
        self.category_repo = category_repo

    async def list_categories(self) -> list[ExpenseCategoryResponse]:
        categories = await self.category_repo.find_all()
        return [ExpenseCategoryResponse.model_validate(c) for c in categories]

    async def create_category(self, name: str, persona=None) -> ExpenseCategoryResponse:
        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner can add expense categories.",
            )
        name = name.strip()
        existing = await self.category_repo.find_by_name(name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This category already exists.",
            )
        category = await self.category_repo.create(name)
        return ExpenseCategoryResponse.model_validate(category)

    async def delete_category(self, category_id: str, persona=None) -> None:
        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner can delete expense categories.",
            )
        category = await self.category_repo.find_by_id(category_id)
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Expense category not found.",
            )
        if await self.category_repo.count() <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one expense category must remain.",
            )
        await self.category_repo.delete(category)
