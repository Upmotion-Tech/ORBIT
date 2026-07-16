from datetime import date
from typing import Optional
from fastapi import HTTPException, status
from app.models.expense import Expense
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.notification_repository import NotificationRepository

class ExpenseService:
    def __init__(self, expense_repo: ExpenseRepository, notification_repo: Optional[NotificationRepository] = None):
        self.expense_repo = expense_repo
        self.notification_repo = notification_repo

    async def list_expenses(self, **kwargs) -> list[Expense]:
        return await self.expense_repo.find_all(**kwargs)

    async def get_expense(self, expense_id: str) -> Optional[Expense]:
        return await self.expense_repo.find_by_id(expense_id)

    async def create_expense(self, data: dict, user: str = "anonymous") -> Expense:
        data["created_by"] = user
        data["updated_by"] = user
        expense = await self.expense_repo.create(data)

        if self.notification_repo:
            message = f"Expense of {expense.currency} {expense.amount:,.2f} for category '{expense.category}' submitted by {user}."
            await self.notification_repo.create(
                user_id="financehead",
                notif_type="Expense Submitted",
                title="New Expense Logged",
                message=message
            )
            await self.notification_repo.create(
                user_id="owner",
                notif_type="Expense Submitted",
                title="New Expense Logged",
                message=message
            )
        return expense

    async def update_expense(self, expense_id: str, data: dict, user: str = "anonymous") -> Expense:
        expense = await self.expense_repo.find_by_id(expense_id)
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")

        old_status = expense.status
        data["updated_by"] = user
        updated_expense = await self.expense_repo.update(expense, data)

        new_status = updated_expense.status
        if old_status != new_status and self.notification_repo:
            notif_type = f"Expense {new_status}"
            title = f"Expense Request {new_status}"
            message = f"Expense #{expense.id[:8].upper()} of {expense.currency} {expense.amount:,.2f} for '{expense.category}' has been {new_status.lower()}."
            
            await self.notification_repo.create(user_id="financehead", notif_type=notif_type, title=title, message=message)
            await self.notification_repo.create(user_id="owner", notif_type=notif_type, title=title, message=message)

        return updated_expense

    async def delete_expense(self, expense_id: str) -> None:
        expense = await self.expense_repo.find_by_id(expense_id)
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")
        await self.expense_repo.soft_delete(expense)
