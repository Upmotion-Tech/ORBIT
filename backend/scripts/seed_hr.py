"""
Seed script to populate HR data (employees, leaves, openings, etc.).
Usage: python -m scripts.seed_hr
"""
import asyncio
import uuid
from datetime import date, datetime

from app.core.database import async_session_factory, engine, Base
from app.models.employee import Employee
from app.models.leave_request import LeaveRequest
from app.models.job_opening import JobOpening
from app.models.hiring_candidate import HiringCandidate
from app.models.leave_policy import LeavePolicy
from app.models.holiday import Holiday
from app.models.notification import Notification
from app.core.security import get_password_hash
from app.core.time import now_pkt


EMPLOYEES = [
    {"id": "emp_owner", "name": "Jordan Blake", "role": "Finance Lead / Co-founder", "department": "Finance", "email": "jordan@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 1, 15), "salary": 250000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_sales1", "name": "Tom Reyes", "role": "Sales Lead / Co-founder", "department": "Sales", "email": "tom@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 1, 15), "salary": 220000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_hr1", "name": "Maya Torres", "role": "HR Lead / Co-founder", "department": "HR", "email": "maya@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 1, 15), "salary": 200000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_hr2", "name": "Ingrid Halvorsen", "role": "HR Coordinator", "department": "HR", "email": "ingrid@theupmotion.online", "manager": "Maya Torres", "employment_type": "Full-time", "start_date": date(2024, 3, 1), "salary": 75000.0, "status": "Active", "probation_end": date(2024, 9, 1), "contract_file": True},
    {"id": "emp_hr3", "name": "Elliot Park", "role": "Recruiter", "department": "HR", "email": "elliot@theupmotion.online", "manager": "Maya Torres", "employment_type": "Full-time", "start_date": date(2024, 6, 1), "salary": 65000.0, "status": "Active", "probation_end": date(2024, 12, 1), "contract_file": True},
    {"id": "emp_dev1", "name": "Kofi Mensah", "role": "Engineer", "department": "Software Dev", "email": "kofi@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 2, 1), "salary": 120000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_dev2", "name": "Aisha Khan", "role": "Senior Engineer", "department": "Software Dev", "email": "aisha@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 2, 15), "salary": 140000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_dev3", "name": "Diego Fuentes", "role": "Backend Engineer", "department": "Software Dev", "email": "diego@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 4, 1), "salary": 110000.0, "status": "Active", "probation_end": date(2024, 10, 1), "contract_file": True},
    {"id": "emp_dev4", "name": "Owen Blackwell", "role": "QA Engineer", "department": "Software Dev", "email": "owen@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 5, 1), "salary": 90000.0, "status": "Active", "probation_end": date(2024, 11, 1), "contract_file": True},
    {"id": "emp_design1", "name": "Leah Novak", "role": "Product Designer", "department": "Design", "email": "leah@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 3, 15), "salary": 100000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_fin1", "name": "Priya Shah", "role": "Accountant", "department": "Finance", "email": "priya@theupmotion.online", "manager": "Jordan Blake", "employment_type": "Full-time", "start_date": date(2024, 4, 15), "salary": 70000.0, "status": "Active", "probation_end": date(2024, 10, 15), "contract_file": True},
    {"id": "emp_fin2", "name": "Carlos Mendez", "role": "Financial Analyst", "department": "Finance", "email": "carlos@theupmotion.online", "manager": "Jordan Blake", "employment_type": "Full-time", "start_date": date(2024, 5, 1), "salary": 85000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_ops1", "name": "Sofia Marchetti", "role": "Operations Manager", "department": "Operations", "email": "sofia@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 2, 1), "salary": 95000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_ops2", "name": "Liam O'Brien", "role": "Operations Coordinator", "department": "Operations", "email": "liam@theupmotion.online", "manager": "Sofia Marchetti", "employment_type": "Full-time", "start_date": date(2024, 6, 1), "salary": 55000.0, "status": "Active", "probation_end": date(2024, 12, 1), "contract_file": True},
    {"id": "emp_sales2", "name": "Ana Reyes", "role": "Sales Representative", "department": "Sales", "email": "ana@theupmotion.online", "manager": "Tom Reyes", "employment_type": "Full-time", "start_date": date(2024, 3, 1), "salary": 60000.0, "status": "Active", "probation_end": date(2024, 9, 1), "contract_file": True},
    {"id": "emp_sales3", "name": "Marcus Chen", "role": "Sales Development Rep", "department": "Sales", "email": "marcus@theupmotion.online", "manager": "Tom Reyes", "employment_type": "Full-time", "start_date": date(2024, 7, 1), "salary": 50000.0, "status": "Active", "probation_end": date(2025, 1, 1), "contract_file": True},
    {"id": "emp_mkt1", "name": "Yuki Tanaka", "role": "Marketing Lead", "department": "Marketing", "email": "yuki@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 4, 1), "salary": 95000.0, "status": "Active", "probation_end": None, "contract_file": True},
    {"id": "emp_mkt2", "name": "Zara Ahmed", "role": "Content Strategist", "department": "Marketing", "email": "zara@theupmotion.online", "manager": "Yuki Tanaka", "employment_type": "Contractor", "start_date": date(2024, 5, 15), "salary": 60000.0, "status": "Active", "probation_end": date(2024, 11, 15), "contract_file": True},
    {"id": "emp_dev5", "name": "Ravi Patel", "role": "Frontend Engineer", "department": "Software Dev", "email": "ravi@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 6, 15), "salary": 105000.0, "status": "Active", "probation_end": date(2024, 12, 15), "contract_file": True},
    {"id": "emp_dev6", "name": "Nina Kowalski", "role": "Data Engineer", "department": "Software Dev", "email": "nina@theupmotion.online", "manager": None, "employment_type": "Full-time", "start_date": date(2024, 7, 1), "salary": 115000.0, "status": "Active", "probation_end": date(2025, 1, 1), "contract_file": True},
]

LEAVE_REQUESTS = [
    {"employee_id": "emp_dev2", "leave_type": "Annual", "start_date": date(2026, 7, 10), "end_date": date(2026, 7, 14), "days": 5, "reason": "Family vacation", "status": "Approved", "applied_at": datetime(2026, 6, 20, 10, 0, 0)},
    {"employee_id": "emp_design1", "leave_type": "Sick", "start_date": date(2026, 7, 8), "end_date": None, "days": 1, "reason": "Not feeling well", "status": "Pending", "applied_at": datetime(2026, 7, 8, 9, 30, 0)},
    {"employee_id": "emp_dev4", "leave_type": "Annual", "start_date": date(2026, 8, 1), "end_date": date(2026, 8, 5), "days": 5, "reason": "Personal time off", "status": "Pending", "applied_at": datetime(2026, 7, 1, 14, 0, 0)},
    {"employee_id": "emp_fin1", "leave_type": "Casual", "start_date": date(2026, 7, 15), "end_date": date(2026, 7, 15), "days": 1, "reason": "Personal errand", "status": "Approved", "applied_at": datetime(2026, 7, 5, 11, 0, 0)},
    {"employee_id": "emp_dev2", "leave_type": "Sick", "start_date": date(2026, 6, 15), "end_date": date(2026, 6, 16), "days": 2, "reason": "Flu", "status": "Approved", "applied_at": datetime(2026, 6, 15, 8, 0, 0)},
    {"employee_id": "emp_ops1", "leave_type": "Annual", "start_date": date(2026, 9, 5), "end_date": date(2026, 9, 9), "days": 5, "reason": "Traveling abroad", "status": "Pending", "applied_at": datetime(2026, 7, 10, 16, 0, 0)},
    {"employee_id": "emp_sales1", "leave_type": "Annual", "start_date": date(2026, 6, 1), "end_date": date(2026, 6, 5), "days": 5, "reason": "Annual family trip", "status": "Approved", "applied_at": datetime(2026, 5, 1, 9, 0, 0)},
    {"employee_id": "emp_dev3", "leave_type": "Casual", "start_date": date(2026, 7, 16), "end_date": date(2026, 7, 16), "days": 1, "reason": "Doctor appointment", "status": "Approved", "applied_at": datetime(2026, 7, 14, 10, 30, 0)},
]

OPENINGS = [
    {"id": "pos1", "title": "Senior Frontend Engineer", "department": "Software Dev", "status": "Open", "salary_bracket": "$120k - $150k", "experience": "4-6 years", "description": "We are looking for an experienced frontend engineer to join our team and help build next-generation features for the ORBIT platform."},
    {"id": "pos2", "title": "Product Manager", "department": "Product", "status": "Open", "salary_bracket": "$100k - $130k", "experience": "3-5 years", "description": "Seeking a product manager to drive the roadmap for our professional services OS platform."},
    {"id": "pos3", "title": "DevOps Engineer", "department": "Software Dev", "status": "Open", "salary_bracket": "$110k - $140k", "experience": "3-5 years", "description": "Looking for a DevOps engineer to manage our cloud infrastructure and CI/CD pipelines."},
    {"id": "pos4", "title": "Customer Success Manager", "department": "Operations", "status": "Open", "salary_bracket": "$70k - $90k", "experience": "2-4 years", "description": "Hiring a customer success manager to ensure our clients get maximum value from ORBIT."},
    {"id": "pos5", "title": "Junior Designer", "department": "Design", "status": "Filled", "salary_bracket": "$50k - $65k", "experience": "0-2 years", "description": "Position filled. Welcoming a junior designer to our creative team."},
]

CANDIDATES = {
    "pos1": [
        {"name": "Elena Voss", "stage": "Interview", "rating": 4, "notes": "Strong React experience."},
        {"name": "David Kim", "stage": "Screening", "rating": 3, "notes": "Good portfolio."},
        {"name": "Sarah Mitchell", "stage": "Applied", "rating": 0, "notes": ""},
    ],
    "pos2": [
        {"name": "Alex Rivera", "stage": "Screening", "rating": 3, "notes": "Has PMP certification."},
        {"name": "Fatima Al-Rashid", "stage": "Applied", "rating": 0, "notes": ""},
    ],
    "pos3": [
        {"name": "James Okafor", "stage": "Interview", "rating": 5, "notes": "Excellent AWS knowledge."},
    ],
    "pos4": [
        {"name": "Hannah Lee", "stage": "Offer", "rating": 4, "notes": "Great communication skills."},
        {"name": "Omar Hassan", "stage": "Applied", "rating": 0, "notes": ""},
    ],
    "pos5": [],  # Filled, no active candidates
}

HOLIDAYS = [
    {"name": "New Year's Day", "date": date(2026, 1, 1)},
    {"name": "Pakistan Day", "date": date(2026, 3, 23)},
    {"name": "Eid ul-Fitr", "date": date(2026, 4, 1)},
    {"name": "Labour Day", "date": date(2026, 5, 1)},
    {"name": "Eid ul-Adha", "date": date(2026, 6, 8)},
    {"name": "Independence Day", "date": date(2026, 8, 14)},
    {"name": "Iqbal Day", "date": date(2026, 11, 9)},
    {"name": "Christmas Day", "date": date(2026, 12, 25)},
]

NOTIFICATIONS = [
    {"user_id": "hr", "notif_type": "Leave Submitted", "title": "Leave request pending", "message": "Leah Novak submitted a sick leave request.", "is_read": False},
    {"user_id": "hr", "notif_type": "Leave Submitted", "title": "Leave request pending", "message": "Owen Blackwell submitted an annual leave request.", "is_read": False},
    {"user_id": "hr", "notif_type": "Leave Submitted", "title": "Leave request pending", "message": "Priya Shah submitted a casual leave request.", "is_read": True},
    {"user_id": "all", "notif_type": "Probation Ending", "title": "Probation ending soon", "message": "Owen Blackwell's probation ends on November 1, 2026.", "is_read": False},
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        # Check if already seeded
        from sqlalchemy import select, func
        result = await session.execute(select(func.count(Employee.id)))
        count = result.scalar_one()
        if count > 0:
            print("HR data already seeded. Skipping.")
            return

        default_password_hash = get_password_hash("password123")

        # Create employees
        for emp_data in EMPLOYEES:
            emp = Employee(
                id=emp_data["id"],
                name=emp_data["name"],
                role=emp_data["role"],
                department=emp_data["department"],
                email=emp_data["email"],
                manager=emp_data["manager"],
                employment_type=emp_data["employment_type"],
                start_date=emp_data["start_date"],
                salary=emp_data["salary"],
                password_hash=default_password_hash,
                status=emp_data["status"],
                probation_end=emp_data["probation_end"],
                contract_file=emp_data["contract_file"],
                created_at=now_pkt(),
                updated_at=now_pkt(),
            )
            session.add(emp)

        # Create HR admin user
        hr_admin = Employee(
            id="emp_hr_admin",
            name="Hamza Shafiq",
            role="HR Admin",
            department="HR",
            email="hamzashafiq@theupmotion.online",
            manager="Maya Torres",
            employment_type="Full-time",
            start_date=date(2024, 1, 1),
            salary=80000.0,
            password_hash=get_password_hash("1234"),
            status="Active",
            probation_end=None,
            contract_file=True,
            created_at=now_pkt(),
            updated_at=now_pkt(),
        )
        session.add(hr_admin)

        # Create leave policy
        policy = LeavePolicy(
            id=str(uuid.uuid4()),
            casual_days=12,
            sick_days=7,
            annual_days=14,
            year=2026,
            updated_by="seed",
        )
        session.add(policy)

        # Create leave requests
        for lr_data in LEAVE_REQUESTS:
            lr = LeaveRequest(
                id=str(uuid.uuid4()),
                employee_id=lr_data["employee_id"],
                leave_type=lr_data["leave_type"],
                start_date=lr_data["start_date"],
                end_date=lr_data["end_date"],
                days=lr_data["days"],
                reason=lr_data["reason"],
                status=lr_data["status"],
                applied_at=lr_data["applied_at"],
            )
            session.add(lr)

        # Create job openings
        for op_data in OPENINGS:
            opening = JobOpening(
                id=op_data["id"],
                title=op_data["title"],
                department=op_data["department"],
                status=op_data["status"],
                salary_bracket=op_data["salary_bracket"],
                experience=op_data["experience"],
                description=op_data["description"],
                opened_at=now_pkt(),
                created_by="seed",
            )
            session.add(opening)

        # Create candidates
        for pos_id, candidates in CANDIDATES.items():
            for c_data in candidates:
                candidate = HiringCandidate(
                    id=str(uuid.uuid4()),
                    opening_id=pos_id,
                    name=c_data["name"],
                    stage=c_data["stage"],
                    rating=c_data["rating"],
                    notes=c_data["notes"],
                )
                session.add(candidate)

        # Create holidays
        for h_data in HOLIDAYS:
            holiday = Holiday(
                id=str(uuid.uuid4()),
                name=h_data["name"],
                date=h_data["date"],
            )
            session.add(holiday)

        # Create notifications
        for n_data in NOTIFICATIONS:
            notif = Notification(
                id=str(uuid.uuid4()),
                user_id=n_data["user_id"],
                type=n_data["notif_type"],
                title=n_data["title"],
                message=n_data["message"],
                is_read=n_data["is_read"],
            )
            session.add(notif)

        await session.commit()
        print(f"Seeded: {len(EMPLOYEES)} employees + 1 HR admin, 1 leave policy, "
              f"{len(LEAVE_REQUESTS)} leave requests, {len(OPENINGS)} openings, "
              f"{sum(len(c) for c in CANDIDATES.values())} candidates, "
              f"{len(HOLIDAYS)} holidays, {len(NOTIFICATIONS)} notifications")


if __name__ == "__main__":
    asyncio.run(seed())
