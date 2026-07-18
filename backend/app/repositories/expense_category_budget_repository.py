import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.expense_category_budget import ExpenseCategoryBudget
from app.core.time import now_pkt


class ExpenseCategoryBudgetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all(self) -> list[ExpenseCategoryBudget]:
        result = await self.db.execute(select(ExpenseCategoryBudget))
        return list(result.scalars().all())

    async def find_by_category(self, category: str) -> ExpenseCategoryBudget | None:
        result = await self.db.execute(
            select(ExpenseCategoryBudget).where(ExpenseCategoryBudget.category == category)
        )
        return result.scalar_one_or_none()

    async def upsert(self, category: str, monthly_budget_usd: float, user: str) -> ExpenseCategoryBudget:
        existing = await self.find_by_category(category)
        if existing:
            existing.monthly_budget_usd = monthly_budget_usd
            existing.updated_by = user
            existing.updated_at = now_pkt()
            await self.db.flush()
            return existing
        budget = ExpenseCategoryBudget(
            id=str(uuid.uuid4()),
            category=category,
            monthly_budget_usd=monthly_budget_usd,
            updated_by=user,
        )
        self.db.add(budget)
        await self.db.flush()
        return budget
