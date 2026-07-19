from typing import Optional

from sqlalchemy import select, func, or_, and_, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.leave_request import LeaveRequest
from app.models.salary_slip import SalarySlip
from app.models.expense import Expense
from app.models.notification import Notification
from app.core.time import now_pkt


class EmployeeRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(self, search=None, department=None, status_filter=None) -> int:
        query = select(func.count(Employee.id)).where(Employee.deleted_at.is_(None))
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Employee.name).contains(q),
                    func.lower(Employee.email).contains(q),
                    func.lower(Employee.role).contains(q),
                )
            )
        if department:
            query = query.where(Employee.department == department)
        if status_filter:
            query = query.where(Employee.status == status_filter)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self, search=None, department=None, status_filter=None,
        sort_by="created_at", sort_dir="desc",
        page=1, page_size=100,
    ) -> list[Employee]:
        query = select(Employee).where(Employee.deleted_at.is_(None))
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Employee.name).contains(q),
                    func.lower(Employee.email).contains(q),
                    func.lower(Employee.role).contains(q),
                )
            )
        if department:
            query = query.where(Employee.department == department)
        if status_filter:
            query = query.where(Employee.status == status_filter)
        sort_col = getattr(Employee, sort_by, Employee.created_at)
        order = sort_col.asc() if sort_dir == "asc" else sort_col.desc()
        query = query.order_by(order)
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, employee_id: str) -> Optional[Employee]:
        query = select(Employee).where(
            Employee.id == employee_id,
            Employee.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_email(self, email: str) -> Optional[Employee]:
        query = select(Employee).where(
            func.lower(Employee.email) == email.strip().lower(),
            Employee.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_name(self, name: str) -> list[Employee]:
        query = select(Employee).where(
            func.lower(Employee.name).contains(name.strip().lower()),
            Employee.deleted_at.is_(None),
        )
        query = query.order_by(Employee.name.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_role(self, role: str) -> list[Employee]:
        query = select(Employee).where(
            func.lower(Employee.role).contains(role.strip().lower()),
            Employee.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, data: dict) -> Employee:
        employee = Employee(**data)
        self.db.add(employee)
        await self.db.flush()
        await self.db.refresh(employee)
        return employee

    async def update(self, employee: Employee, data: dict) -> Employee:
        for key, value in data.items():
            setattr(employee, key, value)
        await self.db.flush()
        await self.db.refresh(employee)
        return employee

    async def soft_delete(self, employee: Employee) -> None:
        employee.deleted_at = now_pkt()
        employee.status = "Inactive"
        await self.db.flush()

    async def hard_delete_with_related_data(self, employee: Employee) -> None:
        # Genuine, irreversible removal — distinct from soft_delete above.
        # employees.id is a nullable=False FK on LeaveRequest.employee_id,
        # SalarySlip.employee_id, and Expense.submitted_by_id, so the row
        # can't be deleted while any of those still reference it.
        # Notification.user_id is a plain string (not a real FK) but is
        # cleared too since "all data of them will be wiped" was explicit.
        await self.db.execute(sql_delete(LeaveRequest).where(LeaveRequest.employee_id == employee.id))
        await self.db.execute(sql_delete(SalarySlip).where(SalarySlip.employee_id == employee.id))
        await self.db.execute(sql_delete(Expense).where(Expense.submitted_by_id == employee.id))
        await self.db.execute(sql_delete(Notification).where(Notification.user_id == employee.id))
        await self.db.delete(employee)
        await self.db.flush()
