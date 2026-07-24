"""
Floods a LOCAL SQLite orbit.db with realistic-looking (but entirely
fictional) Pakistani demo data across every module, and prints Owner login
credentials at the end. For local dev/testing only — refuses to run against
anything that isn't a local sqlite:// DATABASE_URL, since this is exactly
the kind of thing that must never touch the real production Neon database
(see CLAUDE.md's "Demo/seed data must never run automatically" incident).

Usage: python -m scripts.seed_pakistan_demo
"""
import asyncio
import random
import uuid
from datetime import date, datetime, timedelta

from app.core.config import settings
from app.core.database import async_session_factory, engine, Base
from app.core.security import get_password_hash
from app.core.time import now_pkt
from app.models.employee import Employee
from app.models.lead import Lead
from app.models.lead_activity import LeadActivity
from app.models.customer import Customer
from app.models.project import Project
from app.models.task import Task
from app.models.invoice import Invoice
from app.models.expense import Expense
from app.models.expense_category import ExpenseCategory
from app.models.crm_source import CrmSource
from app.models.tax_slab import TaxSlab
from app.models.leave_policy import LeavePolicy
from app.models.leave_request import LeaveRequest
from app.models.wfh_request import WfhRequest
from app.models.attendance import AttendanceRecord

OWNER_EMAIL = "owner@theupmotion.online"
OWNER_PASSWORD = "Owner@12345"

random.seed(42)

FIRST_NAMES_M = ["Ahmad", "Bilal", "Hamza", "Usman", "Fahad", "Hassan", "Adeel", "Waqas", "Imran", "Talha", "Danish", "Junaid", "Faisal", "Umer", "Zeeshan", "Kashif", "Noman", "Asad"]
FIRST_NAMES_F = ["Sana", "Mahnoor", "Ayesha", "Zainab", "Mariam", "Nadia", "Sara", "Rabia", "Kiran", "Hania", "Areeba", "Sadia", "Noor", "Amna", "Fatima", "Iqra"]
LAST_NAMES = ["Raza", "Chaudhry", "Malik", "Aslam", "Farooq", "Siddiqui", "Iqbal", "Hussain", "Sheikh", "Yousaf", "Khan", "Baig", "Ahmed", "Abbasi", "Latif", "Nasir", "Mehmood", "Javed", "Qureshi", "Tariq", "Rehman", "Nawaz"]
CITIES = ["Lahore", "Karachi", "Islamabad", "Faisalabad", "Rawalpindi", "Multan", "Peshawar", "Sialkot"]

FAKE_COMPANIES = [
    "Indus Textiles Ltd", "Ravi Motors", "Sindh AgroTech", "Punjab Steel Works", "Karakoram Logistics",
    "Chenab Apparel", "Neelum Foods", "Margalla Traders", "Hunza Fresh Exports", "Thal Ceramics",
    "Kohistan Pharma", "Soan Valley Dairies", "Sutlej Paper Mills", "Barani Solar Solutions",
    "Cholistan Leather Co", "Attock Auto Parts", "Meridian Apparel Group", "Highland Tea Traders",
]

TASK_TITLES = [
    "Set up CI/CD pipeline", "Fix login page responsiveness", "Design onboarding flow",
    "Write API documentation", "Integrate payment gateway", "Optimize database queries",
    "Build reporting dashboard", "Migrate to new hosting", "Add unit tests", "Refactor auth module",
    "Client demo prep", "Fix Safari layout bug", "Set up staging environment", "Code review backlog",
]


def refuse_if_not_local_sqlite():
    if not settings.db_url.startswith("sqlite"):
        raise SystemExit(
            "Refusing to run: DATABASE_URL is not a local sqlite:// database. "
            "This seed script is for local dev only and must never run against production."
        )


def rand_name(i: int) -> str:
    first = random.choice(FIRST_NAMES_M if i % 2 == 0 else FIRST_NAMES_F)
    return f"{first} {random.choice(LAST_NAMES)}"


async def seed():
    refuse_if_not_local_sqlite()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        from sqlalchemy import select, func
        existing = (await session.execute(select(func.count(Employee.id)))).scalar_one()
        if existing > 0:
            print(f"[SKIP] {existing} employee(s) already exist — refusing to double-seed. "
                  f"Wipe orbit.db first if you want a clean re-seed.")
            return

        default_hash = await get_password_hash("password123")
        owner_hash = await get_password_hash(OWNER_PASSWORD)
        employees: list[Employee] = []

        # ---- Owner (the login the user asked for) ----
        owner = Employee(
            id=str(uuid.uuid4()), name="Zara Sheikh", role="Chief Executive Officer", department="Owner",
            email=OWNER_EMAIL, manager=None, employment_type="Full-time", start_date=date(2023, 1, 1),
            salary=650000.0, password_hash=owner_hash, must_change_password=False, is_active=True,
            access_levels=["owner"], status="Active", cnic="35201-5746852-5",
            created_at=now_pkt(), updated_at=now_pkt(), created_by="seed", updated_by="seed",
        )
        session.add(owner)
        employees.append(owner)

        DEPTS = [
            ("Finance", "finance", 3, (90_000, 300_000)),
            ("HR", "hr", 3, (80_000, 200_000)),
            ("Software Dev", "dev", 6, (120_000, 350_000)),
            ("Dev Member", "dev", 3, (100_000, 220_000)),
            ("Sales", "crm", 3, (80_000, 180_000)),
            ("Marketing", "employee", 2, (90_000, 160_000)),
            ("Operations", "employee", 2, (85_000, 150_000)),
        ]
        managers_by_dept: dict[str, Employee] = {}
        idx = 0
        for dept, access, count, salary_range in DEPTS:
            for n in range(count):
                idx += 1
                is_manager = n == 0
                emp = Employee(
                    id=str(uuid.uuid4()), name=rand_name(idx), role=("Manager" if is_manager else "Executive") + f" — {dept}",
                    department=dept, email=f"user{idx}@theupmotion.online", manager=None,
                    employment_type="Full-time", start_date=date(2024, random.randint(1, 12), random.randint(1, 28)),
                    salary=float(random.randint(*salary_range) // 1000 * 1000),
                    password_hash=default_hash, must_change_password=True, is_active=True,
                    access_levels=[access] if access != "employee" else ["employee"],
                    status="Active", cnic=f"3{random.randint(1000,9999)}{idx:01d}-{random.randint(1000000,9999999)}-{random.randint(1,9)}",
                    phone=f"+92{random.randint(3000000000, 3459999999)}",
                    birthdate=date(random.randint(1985, 2000), random.randint(1, 12), random.randint(1, 28)),
                    created_at=now_pkt(), updated_at=now_pkt(), created_by="seed", updated_by="seed",
                )
                if is_manager:
                    managers_by_dept[dept] = emp
                session.add(emp)
                employees.append(emp)
        await session.flush()

        # Assign managers (department head) to the rest of that department
        for dept, access, count, _ in DEPTS:
            head = managers_by_dept.get(dept)
            if not head:
                continue
            for emp in employees:
                if emp.department == dept and emp.id != head.id and not emp.manager:
                    emp.manager = head.name
        await session.flush()

        dev_employees = [e for e in employees if e.department in ("Software Dev", "Dev Member")]
        crm_employees = [e for e in employees if e.department == "Sales"]

        # ---- CRM sources ----
        for name in ["Website", "Referral", "LinkedIn", "Cold Outreach", "Conference"]:
            session.add(CrmSource(id=str(uuid.uuid4()), name=name, created_at=now_pkt()))

        # ---- Expense categories ----
        for name in ["Travel", "Software & Subscriptions", "Office Supplies", "Utilities", "Marketing", "Client Entertainment"]:
            session.add(ExpenseCategory(id=str(uuid.uuid4()), name=name, created_at=now_pkt()))

        # ---- Customers ----
        customers = []
        for company in FAKE_COMPANIES[:8]:
            cust = Customer(
                id=str(uuid.uuid4()), company_name=company,
                primary_contact_name=rand_name(random.randint(1, 99)),
                primary_contact_email=f"contact@{company.lower().replace(' ', '')}.pk",
                primary_contact_phone=f"+92{random.randint(3000000000, 3459999999)}",
                industry=random.choice(["Textiles", "Manufacturing", "Logistics", "FMCG", "Agriculture", "Retail"]),
                address=f"{random.randint(1, 200)}-B, {random.choice(CITIES)}, Pakistan",
                created_at=now_pkt(), updated_at=now_pkt(),
                created_by_id=owner.id, updated_by_id=owner.id,
            )
            session.add(cust)
            customers.append(cust)
        await session.flush()

        # ---- Leads ----
        stages = ["New", "Contacted", "Proposal", "Negotiation", "Won", "Lost"]
        leads = []
        for i, company in enumerate(FAKE_COMPANIES):
            stage = stages[i % len(stages)]
            received = date.today() - timedelta(days=random.randint(5, 120))
            lead = Lead(
                id=str(uuid.uuid4()), company_name=company, client_contact_name=rand_name(i),
                assigned_rep=random.choice(crm_employees).name if crm_employees else None,
                source=random.choice(["Website", "Referral", "LinkedIn", "Cold Outreach", "Conference"]),
                medium=random.choice(["Organic", "Paid", "Social", "Word of Mouth"]),
                value=float(random.randint(500_000, 8_000_000)),
                stage=stage,
                description=f"Interested in ORBIT for {random.choice(['payroll', 'CRM', 'project tracking', 'invoicing'])}.",
                date_received=received,
                expected_closure_date=received + timedelta(days=random.randint(20, 60)),
                actual_closure_date=received + timedelta(days=random.randint(20, 60)) if stage in ("Won", "Lost") else None,
                follow_up_date=date.today() + timedelta(days=random.randint(-3, 10)),
                is_locked_revenue=(stage == "Won"),
                created_at=now_pkt(), updated_at=now_pkt(), created_by="seed", updated_by="seed",
            )
            session.add(lead)
            leads.append(lead)
        await session.flush()
        for lead in leads:
            session.add(LeadActivity(
                id=str(uuid.uuid4()), lead_id=lead.id, type="create",
                note=f"Lead created in stage '{lead.stage}'.", created_by="seed", created_at=now_pkt(),
            ))

        # ---- Projects + Tasks ----
        proj_statuses = ["Not Started", "In Progress", "In Progress", "Completed", "On Hold"]
        projects = []
        for i, company in enumerate(FAKE_COMPANIES[:8]):
            status = proj_statuses[i % len(proj_statuses)]
            start = date.today() - timedelta(days=random.randint(10, 200))
            team = random.sample(dev_employees, k=min(3, len(dev_employees))) if dev_employees else []
            proj = Project(
                id=str(uuid.uuid4()), name=f"{company.split()[0]} {random.choice(['Platform', 'Portal', 'System', 'App'])}",
                client=company, start_date=start, deadline=start + timedelta(days=random.randint(30, 120)),
                status=status, completed_at=(now_pkt() if status == "Completed" else None),
                at_risk=random.random() < 0.15, budget=float(random.randint(2_000, 40_000)),
                description="Custom software engagement.", team_ids=[e.id for e in team],
                created_at=now_pkt(), updated_at=now_pkt(), created_by_id=owner.id, updated_by_id=owner.id,
            )
            session.add(proj)
            projects.append(proj)
        await session.flush()

        task_statuses = ["Not Started", "In Progress", "In Progress", "Completed", "Blocked"]
        for proj in projects:
            team = [e for e in dev_employees if e.id in (proj.team_ids or [])] or dev_employees
            for t in range(random.randint(3, 6)):
                assignee = random.choice(team) if team else None
                session.add(Task(
                    id=str(uuid.uuid4()), project_id=proj.id, title=random.choice(TASK_TITLES),
                    assignee_id=assignee.id if assignee else None,
                    start_date=proj.start_date, deadline=proj.start_date + timedelta(days=random.randint(5, 45)),
                    status=random.choice(task_statuses), description="Auto-generated demo task.",
                    tags=random.sample(["backend", "frontend", "urgent", "bug", "design"], k=2),
                    created_at=now_pkt(), updated_at=now_pkt(),
                    created_by_id=owner.id, updated_by_id=owner.id,
                ))

        # ---- Invoices ----
        inv_statuses = ["Draft", "Sent", "Paid", "Paid", "Overdue", "Unpaid"]
        for i, proj in enumerate(projects):
            issue = date.today() - timedelta(days=random.randint(5, 90))
            amount = float(random.randint(500, 15_000))
            status = inv_statuses[i % len(inv_statuses)]
            session.add(Invoice(
                id=str(uuid.uuid4()), invoice_number=f"UPM-{issue.year}-{1000+i}", client=proj.client,
                project_id=proj.id, currency="USD", amount=amount,
                line_items=[{"project_id": proj.id, "description": f"{proj.name} — milestone {i+1}", "qty": 1, "unit_price": amount}],
                invoice_type="Fixed", issue_date=issue, due_date=issue + timedelta(days=30), status=status,
                paid_date=(issue + timedelta(days=random.randint(1, 25)) if status == "Paid" else None),
                registration_number="0123456-7", ntn="1234567-8",
                created_at=now_pkt(), updated_at=now_pkt(), created_by="seed", updated_by="seed",
            ))

        # ---- Expenses ----
        exp_categories = ["Travel", "Software & Subscriptions", "Office Supplies", "Utilities", "Marketing", "Client Entertainment"]
        exp_statuses = ["Pending", "Approved", "Approved", "Rejected"]
        for i in range(15):
            submitter = random.choice(employees)
            session.add(Expense(
                id=str(uuid.uuid4()), category=random.choice(exp_categories), amount=float(random.randint(20, 2000)),
                currency="USD", expense_type=random.choice(["Reimbursement", "Direct"]), department=submitter.department,
                submitted_by_id=submitter.id, submitted_date=date.today() - timedelta(days=random.randint(1, 60)),
                status=random.choice(exp_statuses), notes="Auto-generated demo expense.",
                created_at=now_pkt(), updated_at=now_pkt(), created_by="seed", updated_by="seed",
            ))

        # ---- Tax slabs (illustrative test brackets, NOT real FBR figures —
        # verify against the current Finance Act before relying on these) ----
        session.add_all([
            TaxSlab(id=str(uuid.uuid4()), min_salary=0, max_salary=600_000, tax_percentage=0, fixed_tax=0, active=True, created_at=now_pkt(), updated_at=now_pkt()),
            TaxSlab(id=str(uuid.uuid4()), min_salary=600_000, max_salary=1_200_000, tax_percentage=5, fixed_tax=0, active=True, created_at=now_pkt(), updated_at=now_pkt()),
            TaxSlab(id=str(uuid.uuid4()), min_salary=1_200_000, max_salary=2_200_000, tax_percentage=15, fixed_tax=30_000, active=True, created_at=now_pkt(), updated_at=now_pkt()),
            TaxSlab(id=str(uuid.uuid4()), min_salary=2_200_000, max_salary=3_200_000, tax_percentage=25, fixed_tax=180_000, active=True, created_at=now_pkt(), updated_at=now_pkt()),
            TaxSlab(id=str(uuid.uuid4()), min_salary=3_200_000, max_salary=None, tax_percentage=35, fixed_tax=430_000, active=True, created_at=now_pkt(), updated_at=now_pkt()),
        ])

        # ---- Leave policy + requests + WFH ----
        session.add(LeavePolicy(id=str(uuid.uuid4()), casual_days=12, sick_days=7, annual_days=14, year=date.today().year, updated_by="seed"))
        leave_types = ["Annual", "Sick", "Casual"]
        for i in range(10):
            emp = random.choice(employees[1:])
            start = date.today() + timedelta(days=random.randint(1, 30))
            session.add(LeaveRequest(
                id=str(uuid.uuid4()), employee_id=emp.id, leave_type=random.choice(leave_types),
                start_date=start, end_date=start + timedelta(days=random.randint(0, 3)), days=random.randint(1, 4),
                reason="Personal", status=random.choice(["Pending", "Approved", "Rejected"]), applied_at=now_pkt(),
            ))
        for i in range(5):
            emp = random.choice(employees[1:])
            session.add(WfhRequest(
                id=str(uuid.uuid4()), employee_id=emp.id, date=date.today() + timedelta(days=random.randint(1, 14)),
                description="Working from home.", status=random.choice(["Pending", "Approved"]),
                created_at=now_pkt(), updated_at=now_pkt(),
            ))

        # ---- Attendance (last 10 working days for everyone) ----
        day_cursor = date.today()
        working_days = []
        while len(working_days) < 10:
            day_cursor -= timedelta(days=1)
            if day_cursor.weekday() < 5:
                working_days.append(day_cursor)
        for emp in employees:
            for day in working_days:
                if random.random() < 0.92:
                    session.add(AttendanceRecord(
                        id=str(uuid.uuid4()), employee_id=emp.id, date=day, status="Present",
                        marked_at=datetime.combine(day, datetime.min.time()) + timedelta(hours=9, minutes=random.randint(0, 45)),
                        created_at=now_pkt(), updated_at=now_pkt(),
                    ))

        await session.commit()
        print(f"[OK] Seeded {len(employees)} employees, {len(leads)} leads, {len(customers)} customers, "
              f"{len(projects)} projects (+tasks), 8 invoices+, 15 expenses, 5 tax slabs, leave/WFH/attendance data.")
        print()
        print("=" * 60)
        print("OWNER LOGIN")
        print(f"  Email:    {OWNER_EMAIL}")
        print(f"  Password: {OWNER_PASSWORD}")
        print("=" * 60)
        print("All other employees: password123 (each must change on first login)")


if __name__ == "__main__":
    asyncio.run(seed())
