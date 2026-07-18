from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.expense import Expense
from app.repositories.expense_category_budget_repository import ExpenseCategoryBudgetRepository
from app.repositories.settings_repository import SettingsRepository
from app.schemas.expense_category_budget import ExpenseCategoryBudgetResponse
from app.core.time import now_pkt
from app.core.permissions import has_role


class ExpenseCategoryBudgetService:
    def __init__(self, db: AsyncSession, budget_repo: ExpenseCategoryBudgetRepository):
        self.db = db
        self.budget_repo = budget_repo

    async def _actuals_this_month(self) -> dict[str, float]:
        settings_repo = SettingsRepository(self.db)
        settings = await settings_repo.get_currency_settings()
        rate = settings.usd_to_pkr_rate or 278.0

        today = now_pkt().date()
        start_of_month = date(today.year, today.month, 1)
        end_of_month = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)

        query = (
            select(Expense.category, Expense.currency, func.sum(Expense.amount))
            .where(
                Expense.status == "Approved",
                Expense.submitted_date >= start_of_month,
                Expense.submitted_date < end_of_month,
            )
            .group_by(Expense.category, Expense.currency)
        )
        result = await self.db.execute(query)
        actuals: dict[str, float] = {}
        for category, currency, amount in result.all():
            if not amount:
                continue
            val_usd = amount / rate if currency == "PKR" else amount
            actuals[category] = actuals.get(category, 0.0) + val_usd
        return actuals

    async def list_budgets(self) -> list[ExpenseCategoryBudgetResponse]:
        actuals = await self._actuals_this_month()
        budgets = await self.budget_repo.find_all()
        budget_by_category = {b.category: b.monthly_budget_usd for b in budgets}

        # Union: every category with an explicit budget target AND every
        # category with real spend this month (even if no target has been
        # set for it yet) — a real category shouldn't silently disappear
        # from this panel just because nobody's configured a budget for it.
        categories = sorted(set(budget_by_category.keys()) | set(actuals.keys()))
        return [
            ExpenseCategoryBudgetResponse(
                category=cat,
                budget_usd=round(budget_by_category.get(cat, 0.0), 2),
                actual_usd=round(actuals.get(cat, 0.0), 2),
            )
            for cat in categories
        ]

    async def set_budget(self, category: str, monthly_budget_usd: float, user: str, persona=None) -> ExpenseCategoryBudgetResponse:
        if not has_role(persona, "owner", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner or Finance can set expense category budgets.",
            )
        await self.budget_repo.upsert(category, monthly_budget_usd, user)
        actuals = await self._actuals_this_month()
        return ExpenseCategoryBudgetResponse(
            category=category,
            budget_usd=round(monthly_budget_usd, 2),
            actual_usd=round(actuals.get(category, 0.0), 2),
        )
