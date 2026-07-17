import asyncio
import uuid
from datetime import date, datetime
from sqlalchemy import select, func

from app.core.database import async_session_factory
from app.models.employee import Employee
from app.models.project import Project
from app.models.invoice import Invoice
from app.models.expense import Expense
from app.models.milestone import Milestone
from app.models.salary_slip import SalarySlip
from app.core.time import now_pkt

async def seed():
    async with async_session_factory() as session:
        # Check if already seeded
        invoice_count = (await session.execute(select(func.count(Invoice.id)))).scalar() or 0
        if invoice_count > 0:
            print("Finance data already seeded. Skipping.")
            return

        # Fetch employees and projects
        employees = (await session.execute(select(Employee))).scalars().all()
        projects = (await session.execute(select(Project))).scalars().all()

        if not employees:
            print("Please run `seed_hr.py` first to populate employees.")
            return

        if not projects:
            default_project = Project(
                id=str(uuid.uuid4()),
                name="Acme Portal Integration",
                client="Acme Corp",
                status="In Progress",
                budget=50000.0,
                description="Seeded project for billing integration."
            )
            session.add(default_project)
            await session.flush()
            projects = [default_project]

        print("Seeding Finance Module...")

        # Find Hamza (HR Admin) and Ayesha (Dev member)
        hamza = next((e for e in employees if e.email == "hamzashafiq@theupmotion.online"), employees[0])
        ayesha = next((e for e in employees if e.email == "ayesha@theupmotion.online"), employees[0])
        hassan = next((e for e in employees if e.email == "hassan@theupmotion.online"), employees[0])

        # 1. Seed Invoices
        invoices_data = [
            {"invoice_number": "UPM-CZ-2026-001", "client": "Acme Corp", "project_id": projects[0].id, "currency": "USD", "amount": 15000.0, "invoice_type": "Fixed", "issue_date": date(2026, 7, 1), "due_date": date(2026, 7, 31), "status": "Sent", "notes": "Initial milestone payment."},
            {"invoice_number": "UPM-CZ-2026-002", "client": "Globex", "project_id": projects[0].id, "currency": "USD", "amount": 25000.0, "invoice_type": "Fixed", "issue_date": date(2026, 6, 1), "due_date": date(2026, 7, 1), "status": "Paid", "notes": "Project kickoff payment."},
            {"invoice_number": "UPM-CZ-2026-003", "client": "Initech", "project_id": projects[0].id, "currency": "PKR", "amount": 450000.0, "invoice_type": "Hourly", "issue_date": date(2026, 7, 5), "due_date": date(2026, 8, 5), "status": "Draft", "notes": "Consulting services billing."},
            {"invoice_number": "UPM-CZ-2026-004", "client": "Acme Corp", "project_id": projects[0].id, "currency": "USD", "amount": 10000.0, "invoice_type": "Fixed", "issue_date": date(2026, 5, 10), "due_date": date(2026, 6, 10), "status": "Overdue", "notes": "Design sign-off billing."}
        ]

        for inv_data in invoices_data:
            invoice = Invoice(
                id=str(uuid.uuid4()),
                invoice_number=inv_data["invoice_number"],
                client=inv_data["client"],
                project_id=inv_data["project_id"],
                currency=inv_data["currency"],
                amount=inv_data["amount"],
                line_items=[{
                    "project_id": inv_data["project_id"], "description": projects[0].name,
                    "qty": 1, "unit_price": inv_data["amount"],
                }],
                invoice_type=inv_data["invoice_type"],
                issue_date=inv_data["issue_date"],
                due_date=inv_data["due_date"],
                status=inv_data["status"],
                notes=inv_data["notes"],
                created_by="seed",
                updated_by="seed"
            )
            session.add(invoice)

        # 2. Seed Expenses
        expenses_data = [
            {"category": "Software", "amount": 120.0, "currency": "USD", "expense_type": "Operational", "department": "Software Dev", "submitted_by_id": ayesha.id, "submitted_date": date(2026, 7, 10), "status": "Approved", "notes": "Github Enterprise seat license."},
            {"category": "Office Supply", "amount": 4500.0, "currency": "PKR", "expense_type": "Operational", "department": "HR", "submitted_by_id": hamza.id, "submitted_date": date(2026, 7, 12), "status": "Pending", "notes": "Stationery and notebooks for HR."},
            {"category": "Travel", "amount": 350.0, "currency": "USD", "expense_type": "Business", "department": "Design", "submitted_by_id": hassan.id, "submitted_date": date(2026, 7, 8), "status": "Approved", "notes": "Client meeting travel expenses."},
            {"category": "Software", "amount": 80.0, "currency": "USD", "expense_type": "Operational", "department": "Software Dev", "submitted_by_id": ayesha.id, "submitted_date": date(2026, 7, 15), "status": "Pending", "notes": "Figma Pro seat subscription."}
        ]

        for exp_data in expenses_data:
            expense = Expense(
                id=str(uuid.uuid4()),
                category=exp_data["category"],
                amount=exp_data["amount"],
                currency=exp_data["currency"],
                expense_type=exp_data["expense_type"],
                department=exp_data["department"],
                submitted_by_id=exp_data["submitted_by_id"],
                submitted_date=exp_data["submitted_date"],
                status=exp_data["status"],
                notes=exp_data["notes"],
                created_by="seed",
                updated_by="seed"
            )
            session.add(expense)

        # 3. Seed Milestones
        milestones_data = [
            {"project_id": projects[0].id, "name": "Design Discovery", "amount": 8000.0, "currency": "USD", "expected_date": date(2026, 6, 15), "status": "Received"},
            {"project_id": projects[0].id, "name": "Alpha Release", "amount": 12000.0, "currency": "USD", "expected_date": date(2026, 7, 25), "status": "Expected"},
            {"project_id": projects[0].id, "name": "Beta Release", "amount": 15000.0, "currency": "USD", "expected_date": date(2026, 8, 30), "status": "Expected"},
            {"project_id": projects[0].id, "name": "Final Launch", "amount": 20000.0, "currency": "USD", "expected_date": date(2026, 9, 30), "status": "Expected"}
        ]

        for ms_data in milestones_data:
            milestone = Milestone(
                id=str(uuid.uuid4()),
                project_id=ms_data["project_id"],
                name=ms_data["name"],
                amount=ms_data["amount"],
                currency=ms_data["currency"],
                expected_date=ms_data["expected_date"],
                status=ms_data["status"],
                created_by="seed",
                updated_by="seed"
            )
            session.add(milestone)

        # 4. Seed Salary Slips
        current_month_str = now_pkt().date().strftime("%Y-%m")
        slips_data = [
            {"employee_id": ayesha.id, "month": current_month_str, "gross_salary": ayesha.salary, "tax": 25000.0, "other_deductions": 5000.0, "bonus": 10000.0, "allowances": 15000.0, "net_salary": ayesha.salary + 10000.0 + 15000.0 - 25000.0 - 5000.0, "payment_status": "Unpaid", "notes": "Monthly payroll check."},
            {"employee_id": hassan.id, "month": current_month_str, "gross_salary": hassan.salary, "tax": 12000.0, "other_deductions": 2000.0, "bonus": 0.0, "allowances": 8000.0, "net_salary": hassan.salary + 8000.0 - 12000.0 - 2000.0, "payment_status": "Paid", "payment_date": now_pkt().date(), "notes": "Disbursed via bank transfer."}
        ]

        for slip_data in slips_data:
            slip = SalarySlip(
                id=str(uuid.uuid4()),
                employee_id=slip_data["employee_id"],
                month=slip_data["month"],
                gross_salary=slip_data["gross_salary"],
                tax=slip_data["tax"],
                other_deductions=slip_data["other_deductions"],
                bonus=slip_data["bonus"],
                allowances=slip_data["allowances"],
                net_salary=slip_data["net_salary"],
                payment_status=slip_data["payment_status"],
                payment_date=slip_data.get("payment_date"),
                notes=slip_data["notes"],
                created_by="seed",
                updated_by="seed"
            )
            session.add(slip)

        await session.commit()
        print("Finance Module data seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
