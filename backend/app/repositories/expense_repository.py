from datetime import date
from typing import Optional
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.core.time import now_pkt
from app.models.expense import Expense
from app.models.employee import Employee

class ExpenseRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _apply_filters(
        self,
        query,
        search: Optional[str] = None,
        status: Optional[str] = None,
        department: Optional[str] = None,
        category: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Expense.category).contains(q),
                    func.lower(Expense.department).contains(q),
                    func.lower(Employee.name).contains(q),
                )
            )
        if status:
            query = query.where(Expense.status == status)
        if department:
            query = query.where(Expense.department == department)
        if category:
            query = query.where(Expense.category == category)
        if date_from:
            query = query.where(Expense.submitted_date >= date_from)
        if date_to:
            query = query.where(Expense.submitted_date <= date_to)
        return query

    async def count(
        self,
        search: Optional[str] = None,
        status: Optional[str] = None,
        department: Optional[str] = None,
        category: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> int:
        query = select(func.count(Expense.id)).join(Expense.submitted_by).where(Expense.deleted_at.is_(None))
        query = self._apply_filters(query, search, status, department, category, date_from, date_to)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self,
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
    ) -> list[Expense]:
        query = select(Expense).join(Expense.submitted_by).options(joinedload(Expense.submitted_by)).where(Expense.deleted_at.is_(None))
        query = self._apply_filters(query, search, status, department, category, date_from, date_to)

        # Apply sorting
        sort_column = getattr(Expense, sort_by, Expense.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, expense_id: str) -> Optional[Expense]:
        query = select(Expense).options(joinedload(Expense.submitted_by)).where(
            Expense.id == expense_id,
            Expense.deleted_at.is_(None)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> Expense:
        expense = Expense(**data)
        self.db.add(expense)
        await self.db.flush()
        # Load relationships
        query = select(Expense).options(joinedload(Expense.submitted_by)).where(Expense.id == expense.id)
        res = await self.db.execute(query)
        return res.scalar_one()

    async def update(self, expense: Expense, data: dict) -> Expense:
        for key, value in data.items():
            setattr(expense, key, value)
        await self.db.flush()
        await self.db.refresh(expense)
        return expense

    async def soft_delete(self, expense: Expense) -> None:
        expense.deleted_at = now_pkt()
        await self.db.flush()
