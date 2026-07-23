from typing import Optional

from sqlalchemy import select, func, or_, and_, delete as sql_delete, update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.leave_request import LeaveRequest
from app.models.salary_slip import SalarySlip
from app.models.expense import Expense
from app.models.notification import Notification
from app.models.attendance import AttendanceRecord
from app.models.wfh_request import WfhRequest

from app.models.audit_log import AuditLog
from app.models.project_comment import ProjectComment
from app.models.task import Task
from app.models.project import Project
from app.models.customer import Customer
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

    async def find_by_exact_name(self, name: str) -> Optional[Employee]:
        # Exact (case-insensitive) match — for resolving a manager name
        # (Employee.manager is a free-text name, not an FK) to the actual
        # manager's record, e.g. to target a leave/WFH notification at them
        # specifically rather than broadcasting to a role. `find_by_name`
        # below is a "contains" search for UI autocomplete and would wrongly
        # match e.g. "John" against both "John Smith" and "Johnny Appleseed".
        # func.trim() on the stored column too — matched against only the
        # *input* being stripped, a stored name with incidental leading/
        # trailing whitespace (e.g. a typo'd "Syed Hashim " at data entry)
        # would otherwise silently never match and no notification would go
        # out, with nothing in the UI hinting why.
        query = select(Employee).where(
            func.lower(func.trim(Employee.name)) == name.strip().lower(),
            Employee.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalars().first()

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
        # Clear/unlink all foreign keys referencing employees.id before deleting.
        
        # 1. Unlink nullable FK references to this employee
        await self.db.execute(sql_update(LeaveRequest).where(LeaveRequest.approved_by_id == employee.id).values(approved_by_id=None))
        await self.db.execute(sql_update(SalarySlip).where(SalarySlip.created_by_id == employee.id).values(created_by_id=None))
        await self.db.execute(sql_update(SalarySlip).where(SalarySlip.updated_by_id == employee.id).values(updated_by_id=None))
        await self.db.execute(sql_update(Task).where(Task.assignee_id == employee.id).values(assignee_id=None))
        await self.db.execute(sql_update(Task).where(Task.created_by_id == employee.id).values(created_by_id=None))
        await self.db.execute(sql_update(Task).where(Task.updated_by_id == employee.id).values(updated_by_id=None))
        await self.db.execute(sql_update(Project).where(Project.created_by_id == employee.id).values(created_by_id=None))
        await self.db.execute(sql_update(Project).where(Project.updated_by_id == employee.id).values(updated_by_id=None))
        await self.db.execute(sql_update(Customer).where(Customer.created_by_id == employee.id).values(created_by_id=None))
        await self.db.execute(sql_update(Customer).where(Customer.updated_by_id == employee.id).values(updated_by_id=None))

        # 2. Delete related records belonging directly to this employee
        await self.db.execute(sql_delete(AttendanceRecord).where(AttendanceRecord.employee_id == employee.id))
        await self.db.execute(sql_delete(WfhRequest).where(WfhRequest.employee_id == employee.id))

        await self.db.execute(sql_delete(AuditLog).where(AuditLog.actor_id == employee.id))
        await self.db.execute(sql_delete(ProjectComment).where(ProjectComment.author_id == employee.id))
        await self.db.execute(sql_delete(LeaveRequest).where(LeaveRequest.employee_id == employee.id))
        await self.db.execute(sql_delete(SalarySlip).where(SalarySlip.employee_id == employee.id))
        await self.db.execute(sql_delete(Expense).where(Expense.submitted_by_id == employee.id))
        await self.db.execute(sql_delete(Notification).where(Notification.user_id == employee.id))

        # 3. Delete employee record
        await self.db.delete(employee)
        await self.db.flush()

