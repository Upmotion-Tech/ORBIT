from datetime import date
from typing import Optional
from fastapi import HTTPException, status
from app.models.salary_slip import SalarySlip
from app.repositories.salary_slip_repository import SalarySlipRepository
from app.repositories.notification_repository import NotificationRepository
from app.core.time import now_pkt

class SalarySlipService:
    def __init__(self, slip_repo: SalarySlipRepository, notification_repo: Optional[NotificationRepository] = None):
        self.slip_repo = slip_repo
        self.notification_repo = notification_repo

    async def list_slips(self, **kwargs) -> list[SalarySlip]:
        return await self.slip_repo.find_all(**kwargs)

    async def get_slip(self, slip_id: str) -> Optional[SalarySlip]:
        return await self.slip_repo.find_by_id(slip_id)

    async def get_or_create_slip(self, employee_id: str, month: str, base_salary: float, user: str = "anonymous") -> SalarySlip:
        slip = await self.slip_repo.find_by_employee_and_month(employee_id, month)
        if not slip:
            # Dynamically initialize and save slip record
            data = {
                "employee_id": employee_id,
                "month": month,
                "gross_salary": base_salary,
                "tax": 0.0,
                "other_deductions": 0.0,
                "bonus": 0.0,
                "allowances": 0.0,
                "net_salary": base_salary,
                "payment_status": "Unpaid",
                "notes": "",
                "created_by": user,
                "updated_by": user
            }
            slip = await self.slip_repo.create(data)
            return slip

        # A slip already exists for this employee/month. Once it's Paid it's
        # a historical record and stays locked — but an Unpaid slip should
        # keep tracking the employee's current salary, since it was only
        # ever a snapshot taken the first time this month's payroll page
        # happened to be opened, not a deliberate finalized figure. Without
        # this, editing an employee's salary in HR silently never reaches
        # payroll for the current month.
        if slip.payment_status != "Paid" and slip.gross_salary != base_salary:
            data = {
                "gross_salary": base_salary,
                "net_salary": base_salary + slip.allowances + slip.bonus - slip.tax - slip.other_deductions,
                "updated_by": user,
            }
            slip = await self.slip_repo.update(slip, data)
        return slip

    async def update_slip(self, slip_id: str, data: dict, user: str = "anonymous") -> SalarySlip:
        slip = await self.slip_repo.find_by_id(slip_id)
        if not slip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")

        # Gross salary is never directly editable here — it always tracks
        # the employee's actual set salary (see get_or_create_slip, which
        # keeps it in sync for as long as the slip is Unpaid). Silently drop
        # it rather than let a client-supplied value override that.
        data.pop("gross_salary", None)

        # Recompute net salary based on update variables or existing values
        gross = data.get("gross_salary", slip.gross_salary)
        tax = data.get("tax", slip.tax)
        deductions = data.get("other_deductions", slip.other_deductions)
        bonus = data.get("bonus", slip.bonus)
        allowances = data.get("allowances", slip.allowances)
        
        data["net_salary"] = gross + allowances + bonus - tax - deductions
        data["updated_by"] = user
        
        old_status = slip.payment_status
        new_status = data.get("payment_status", old_status)
        if new_status == "Paid" and old_status != "Paid" and "payment_date" not in data:
            data["payment_date"] = now_pkt().date()

        updated_slip = await self.slip_repo.update(slip, data)

        # Trigger notifications
        if old_status != new_status and new_status == "Paid" and self.notification_repo:
            emp = updated_slip.employee
            emp_name = emp.name if emp else "Employee"
            await self.notification_repo.create(
                user_id="finance",
                notif_type="Salary Paid",
                title="Salary Payment Processed",
                message=f"Salary for {emp_name} for the month of {updated_slip.month} has been marked as Paid."
            )
            await self.notification_repo.create(
                user_id="owner",
                notif_type="Salary Paid",
                title="Salary Payment Processed",
                message=f"Salary for {emp_name} for the month of {updated_slip.month} has been marked as Paid."
            )
            if emp:
                await self.notification_repo.create(
                    user_id=emp.id,
                    notif_type="Salary Paid",
                    title="Salary Disbursed",
                    message=f"Your salary slip for {updated_slip.month} has been marked as Paid."
                )

        return updated_slip

    async def delete_slip(self, slip_id: str) -> None:
        slip = await self.slip_repo.find_by_id(slip_id)
        if not slip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Salary slip not found.")
        await self.slip_repo.soft_delete(slip)
