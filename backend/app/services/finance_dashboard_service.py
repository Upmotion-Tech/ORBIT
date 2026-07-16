from datetime import date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.invoice import Invoice
from app.models.expense import Expense
from app.models.salary_slip import SalarySlip
from app.models.milestone import Milestone
from app.models.employee import Employee
from app.repositories.settings_repository import SettingsRepository
from app.core.time import now_pkt

class FinanceDashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_stats(self) -> dict:
        settings_repo = SettingsRepository(self.db)
        settings = await settings_repo.get_currency_settings()
        rate = settings.usd_to_pkr_rate or 278.0

        today = now_pkt().date()
        current_month_str = today.strftime("%Y-%m")

        # Month boundaries
        start_of_month = date(today.year, today.month, 1)
        if today.month == 12:
            end_of_month = date(today.year + 1, 1, 1)
        else:
            end_of_month = date(today.year, today.month + 1, 1)

        # ── 1. Invoices ──────────────────────────────────────────────
        invoice_query = (
            select(Invoice.status, Invoice.currency, func.sum(Invoice.amount))
            .group_by(Invoice.status, Invoice.currency)
        )
        invoice_res = await self.db.execute(invoice_query)
        invoice_groups = invoice_res.all()

        total_outstanding_usd = 0.0
        total_paid_usd = 0.0

        OUTSTANDING_STATUSES = {"New", "Sent", "Overdue", "Unpaid"}

        for status_val, currency, amount in invoice_groups:
            if not amount:
                continue
            val_usd = amount / rate if currency == "PKR" else amount
            if status_val in OUTSTANDING_STATUSES:
                total_outstanding_usd += val_usd
            elif status_val == "Paid":
                total_paid_usd += val_usd

        # Monthly revenue: paid invoices with issue_date in current month
        monthly_revenue_usd = 0.0
        monthly_rev_query = (
            select(Invoice.currency, func.sum(Invoice.amount))
            .where(
                Invoice.status == "Paid",
                Invoice.issue_date >= start_of_month,
                Invoice.issue_date < end_of_month,
            )
            .group_by(Invoice.currency)
        )
        monthly_rev_res = await self.db.execute(monthly_rev_query)
        for cur, amt in monthly_rev_res.all():
            if amt:
                monthly_revenue_usd += (amt / rate if cur == "PKR" else amt)

        # ── 2. Expenses ──────────────────────────────────────────────
        expense_query = (
            select(Expense.status, Expense.currency, func.sum(Expense.amount))
            .group_by(Expense.status, Expense.currency)
        )
        expense_res = await self.db.execute(expense_query)
        expense_groups = expense_res.all()

        pending_expenses_usd = 0.0
        monthly_expenses_usd = 0.0

        for status_val, currency, amount in expense_groups:
            if not amount:
                continue
            val_usd = amount / rate if currency == "PKR" else amount
            if status_val == "Pending":
                pending_expenses_usd += val_usd

        # Approved expenses this month
        monthly_exp_query = (
            select(Expense.currency, func.sum(Expense.amount))
            .where(
                Expense.status == "Approved",
                Expense.submitted_date >= start_of_month,
                Expense.submitted_date < end_of_month,
            )
            .group_by(Expense.currency)
        )
        monthly_exp_res = await self.db.execute(monthly_exp_query)
        for cur, amt in monthly_exp_res.all():
            if amt:
                monthly_expenses_usd += (amt / rate if cur == "PKR" else amt)

        # ── 3. Payroll cost ───────────────────────────────────────────
        payroll_cost_usd = 0.0
        slips_query = select(func.sum(SalarySlip.net_salary)).where(
            SalarySlip.month == current_month_str
        )
        slips_res = await self.db.execute(slips_query)
        slips_sum = slips_res.scalar()

        if slips_sum:
            # Salaries stored in PKR
            payroll_cost_usd = slips_sum / rate
        else:
            # Fallback: active full-time employees' base salary
            emp_query = select(func.sum(Employee.salary)).where(
                Employee.deleted_at.is_(None),
                Employee.employment_type == "Full-time",
                Employee.status == "Active",
            )
            emp_res = await self.db.execute(emp_query)
            emp_sum = emp_res.scalar()
            if emp_sum:
                payroll_cost_usd = emp_sum / rate

        # ── 4. Upcoming Milestones ────────────────────────────────────
        upcoming_milestones_usd = 0.0
        milestone_query = (
            select(Milestone.currency, func.sum(Milestone.amount))
            .where(
                Milestone.status == "Expected",
                Milestone.expected_date >= today,
            )
            .group_by(Milestone.currency)
        )
        milestone_res = await self.db.execute(milestone_query)
        for cur, amt in milestone_res.all():
            if amt:
                upcoming_milestones_usd += (amt / rate if cur == "PKR" else amt)

        return {
            "total_outstanding_usd": round(total_outstanding_usd, 2),
            "total_paid_usd": round(total_paid_usd, 2),
            "monthly_revenue_usd": round(monthly_revenue_usd, 2),
            "monthly_expenses_usd": round(monthly_expenses_usd, 2),
            "pending_expenses_usd": round(pending_expenses_usd, 2),
            "payroll_cost_usd": round(payroll_cost_usd, 2),
            "upcoming_milestones_usd": round(upcoming_milestones_usd, 2),
        }
