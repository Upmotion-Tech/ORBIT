from datetime import date
from typing import Optional
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.core.time import now_pkt
from app.models.salary_slip import SalarySlip
from app.models.employee import Employee

class SalarySlipRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _apply_filters(
        self,
        query,
        search: Optional[str] = None,
        month: Optional[str] = None,
        department: Optional[str] = None,
        payment_status: Optional[str] = None,
        employee_id: Optional[str] = None,
    ):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Employee.name).contains(q),
                    func.lower(Employee.department).contains(q),
                    func.lower(Employee.role).contains(q),
                )
            )
        if month:
            query = query.where(SalarySlip.month == month)
        if department:
            query = query.where(Employee.department == department)
        if payment_status:
            query = query.where(SalarySlip.payment_status == payment_status)
        if employee_id:
            query = query.where(SalarySlip.employee_id == employee_id)
        return query

    async def count(
        self,
        search: Optional[str] = None,
        month: Optional[str] = None,
        department: Optional[str] = None,
        payment_status: Optional[str] = None,
        employee_id: Optional[str] = None,
    ) -> int:
        query = select(func.count(SalarySlip.id)).join(SalarySlip.employee).where(SalarySlip.deleted_at.is_(None))
        query = self._apply_filters(query, search, month, department, payment_status, employee_id)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self,
        search: Optional[str] = None,
        month: Optional[str] = None,
        department: Optional[str] = None,
        payment_status: Optional[str] = None,
        employee_id: Optional[str] = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        page: int = 1,
        page_size: int = 100,
    ) -> list[SalarySlip]:
        query = select(SalarySlip).join(SalarySlip.employee).options(joinedload(SalarySlip.employee)).where(SalarySlip.deleted_at.is_(None))
        query = self._apply_filters(query, search, month, department, payment_status, employee_id)

        # Apply sorting
        sort_column = getattr(SalarySlip, sort_by, SalarySlip.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, slip_id: str) -> Optional[SalarySlip]:
        query = select(SalarySlip).options(joinedload(SalarySlip.employee)).where(
            SalarySlip.id == slip_id,
            SalarySlip.deleted_at.is_(None)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_employee_and_month(self, employee_id: str, month: str) -> Optional[SalarySlip]:
        query = select(SalarySlip).options(joinedload(SalarySlip.employee)).where(
            SalarySlip.employee_id == employee_id,
            SalarySlip.month == month,
            SalarySlip.deleted_at.is_(None)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> SalarySlip:
        slip = SalarySlip(**data)
        self.db.add(slip)
        await self.db.flush()
        # Load relationships
        query = select(SalarySlip).options(joinedload(SalarySlip.employee)).where(SalarySlip.id == slip.id)
        res = await self.db.execute(query)
        return res.scalar_one()

    async def update(self, slip: SalarySlip, data: dict) -> SalarySlip:
        for key, value in data.items():
            setattr(slip, key, value)
        await self.db.flush()
        # Same MissingGreenlet risk as invoice/expense/job_opening repos had:
        # a bare refresh() expires `employee` without reloading it.
        return await self.find_by_id(slip.id)

    async def soft_delete(self, slip: SalarySlip) -> None:
        slip.deleted_at = now_pkt()
        await self.db.flush()
