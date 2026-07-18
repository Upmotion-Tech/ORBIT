import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.expense_category import ExpenseCategory

DEFAULT_CATEGORIES = ["Software", "Travel", "Office Supply", "Marketing", "Other"]


class ExpenseCategoryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all(self) -> list[ExpenseCategory]:
        result = await self.db.execute(
            select(ExpenseCategory).order_by(ExpenseCategory.created_at.asc())
        )
        categories = list(result.scalars().all())
        if not categories:
            for name in DEFAULT_CATEGORIES:
                categories.append(await self.create(name))
        return categories

    async def find_by_name(self, name: str) -> ExpenseCategory | None:
        result = await self.db.execute(
            select(ExpenseCategory).where(ExpenseCategory.name == name)
        )
        return result.scalar_one_or_none()

    async def create(self, name: str) -> ExpenseCategory:
        category = ExpenseCategory(id=str(uuid.uuid4()), name=name)
        self.db.add(category)
        await self.db.flush()
        return category

    async def find_by_id(self, category_id: str) -> ExpenseCategory | None:
        result = await self.db.execute(
            select(ExpenseCategory).where(ExpenseCategory.id == category_id)
        )
        return result.scalar_one_or_none()

    async def delete(self, category: ExpenseCategory) -> None:
        await self.db.delete(category)
        await self.db.flush()

    async def count(self) -> int:
        result = await self.db.execute(select(ExpenseCategory))
        return len(list(result.scalars().all()))
