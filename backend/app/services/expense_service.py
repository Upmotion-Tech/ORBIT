from datetime import date
from typing import Optional
from fastapi import HTTPException, status
from app.models.expense import Expense
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.notification_repository import NotificationRepository

class ExpenseService:
    def __init__(self, expense_repo: ExpenseRepository, notification_repo: Optional[NotificationRepository] = None, audit_repo = None):
        self.expense_repo = expense_repo
        self.notification_repo = notification_repo
        self.audit_repo = audit_repo

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Expense", label, detail)

    async def list_expenses(self, **kwargs) -> list[Expense]:
        return await self.expense_repo.find_all(**kwargs)

    async def get_expense(self, expense_id: str) -> Optional[Expense]:
        return await self.expense_repo.find_by_id(expense_id)

    async def create_expense(self, data: dict, user: str = "anonymous") -> Expense:
        data["created_by"] = user
        data["updated_by"] = user
        expense = await self.expense_repo.create(data)

        if self.notification_repo:
            # `user` here is the raw actor id (used for created_by/audit) — the
            # notification is human-facing, so it needs the employee's name.
            # expense.submitted_by is eager-loaded by expense_repo.create().
            submitter_name = expense.submitted_by.name if expense.submitted_by else user
            message = f"Expense of {expense.currency} {expense.amount:,.2f} for category '{expense.category}' submitted by {submitter_name}."
            await self.notification_repo.create(
                user_id="finance",
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
        await self._audit(user, "Created", f"{expense.currency} {expense.amount:,.2f} — {expense.category}")
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
            
            await self.notification_repo.create(user_id="finance", notif_type=notif_type, title=title, message=message)
            await self.notification_repo.create(user_id="owner", notif_type=notif_type, title=title, message=message)

        label = f"{updated_expense.currency} {updated_expense.amount:,.2f} — {updated_expense.category}"
        if old_status != new_status:
            await self._audit(user, "Status Changed", label, f"'{old_status}' → '{new_status}'")
        else:
            changed = sorted(k for k in data.keys() if k != "updated_by")
            await self._audit(user, "Updated", label, f"Fields updated: {', '.join(changed)}" if changed else None)

        return updated_expense

    async def delete_expense(self, expense_id: str, user: str = "anonymous") -> None:
        expense = await self.expense_repo.find_by_id(expense_id)
        if not expense:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found.")
        await self._audit(user, "Deleted", f"{expense.currency} {expense.amount:,.2f} — {expense.category}")
        await self.expense_repo.soft_delete(expense)
