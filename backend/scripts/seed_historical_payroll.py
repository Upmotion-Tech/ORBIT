"""
Backfills historical SalarySlip rows (Paid, one per employee per month, from
each employee's own join month through last month) on a LOCAL SQLite orbit.db
only — refuses to run against anything else, same guard as
seed_pakistan_demo.py, since this must never touch the real production Neon
database.

Exists so the new fiscal-year Tax Certificate feature has real multi-month,
multi-fiscal-year data to generate certificates from locally, instead of only
whatever single current month Payroll's own "Generate Salary Slips"/"Mark All
Paid" actions have created so far. Idempotent — skips any employee/month that
already has a slip (including the current month, which stays exclusively
managed by Payroll's live get_or_create_slip flow), so it's safe to re-run.

Usage: python -m scripts.seed_historical_payroll
"""
import asyncio
import calendar
import uuid
from datetime import date

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.time import now_pkt
from app.models.employee import Employee
from app.models.salary_slip import SalarySlip
from app.repositories.tax_slab_repository import TaxSlabRepository
from app.services.tax_slab_service import TaxSlabService


def refuse_if_not_local_sqlite():
    if not settings.db_url.startswith("sqlite"):
        raise SystemExit(
            "Refusing to run: DATABASE_URL is not a local sqlite:// database. "
            "This backfill script is for local dev only and must never run against production."
        )


def month_range(start_year: int, start_month: int, end_year: int, end_month: int) -> list[str]:
    months = []
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


async def backfill():
    refuse_if_not_local_sqlite()

    today = now_pkt().date()
    # Stop the month before the current one — the current month is Payroll's
    # own live territory (get_or_create_slip), not this backfill's.
    last_full_year, last_full_month = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)

    async with async_session_factory() as session:
        tax_service = TaxSlabService(TaxSlabRepository(session))

        employees = (await session.execute(
            select(Employee).where(Employee.deleted_at.is_(None), Employee.status == "Active")
        )).scalars().all()
        if not employees:
            print("[SKIP] No employees found — run seed_pakistan_demo first.")
            return

        owner = next((e for e in employees if e.department == "Owner"), employees[0])

        existing_rows = (await session.execute(
            select(SalarySlip.employee_id, SalarySlip.month).where(SalarySlip.deleted_at.is_(None))
        )).all()
        existing = {(emp_id, month) for emp_id, month in existing_rows}

        created = 0
        for emp in employees:
            months = month_range(emp.start_date.year, emp.start_date.month, last_full_year, last_full_month)
            for month in months:
                if (emp.id, month) in existing:
                    continue
                gross = emp.salary
                tax = await tax_service.calculate_monthly_income_tax(gross)
                net = gross - tax
                year, mo = (int(x) for x in month.split("-"))
                payment_date = date(year, mo, calendar.monthrange(year, mo)[1])
                session.add(SalarySlip(
                    id=str(uuid.uuid4()), employee_id=emp.id, month=month,
                    gross_salary=gross, tax=tax, tax_is_manual=False,
                    other_deductions=0.0, bonus=0.0, allowances=0.0,
                    net_salary=net, payment_status="Paid", payment_date=payment_date,
                    notes="", created_by_id=owner.id, updated_by_id=owner.id,
                    created_at=now_pkt(), updated_at=now_pkt(),
                ))
                created += 1

        await session.commit()
        print(f"[DONE] Backfilled {created} historical salary slip(s) across {len(employees)} employee(s), "
              f"through {last_full_year:04d}-{last_full_month:02d}.")


if __name__ == "__main__":
    asyncio.run(backfill())
