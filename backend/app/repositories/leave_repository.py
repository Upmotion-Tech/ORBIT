from typing import Optional
from datetime import date

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.leave_request import LeaveRequest
from app.models.employee import Employee
from app.core.time import now_pkt


class LeaveRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(self, employee_id=None, status_filter=None, leave_type=None) -> int:
        query = select(func.count(LeaveRequest.id))
        if employee_id:
            query = query.where(LeaveRequest.employee_id == employee_id)
        if status_filter:
            query = query.where(LeaveRequest.status == status_filter)
        if leave_type:
            query = query.where(LeaveRequest.leave_type == leave_type)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self, employee_id=None, status_filter=None, leave_type=None,
        sort_by="applied_at", sort_dir="desc",
        page=1, page_size=100,
    ) -> list[LeaveRequest]:
        query = (
            select(LeaveRequest)
            .options(joinedload(LeaveRequest.employee))
        )
        if employee_id:
            query = query.where(LeaveRequest.employee_id == employee_id)
        if status_filter:
            query = query.where(LeaveRequest.status == status_filter)
        if leave_type:
            query = query.where(LeaveRequest.leave_type == leave_type)
        sort_col = getattr(LeaveRequest, sort_by, LeaveRequest.applied_at)
        order = sort_col.asc() if sort_dir == "asc" else sort_col.desc()
        query = query.order_by(order)
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, leave_id: str) -> Optional[LeaveRequest]:
        query = (
            select(LeaveRequest)
            .options(joinedload(LeaveRequest.employee))
            .where(LeaveRequest.id == leave_id)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_employee_id(self, employee_id: str) -> list[LeaveRequest]:
        query = (
            select(LeaveRequest)
            .options(joinedload(LeaveRequest.employee))
            .where(LeaveRequest.employee_id == employee_id)
            .order_by(LeaveRequest.applied_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_approved_by_type(self, employee_id: str, leave_type: str, year: Optional[int] = None) -> list[LeaveRequest]:
        query = (
            select(LeaveRequest)
            .where(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.leave_type == leave_type,
                LeaveRequest.status == "Approved",
            )
        )
        if year is not None:
            query = query.where(
                LeaveRequest.start_date >= date(year, 1, 1),
                LeaveRequest.start_date <= date(year, 12, 31),
            )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_pending_by_type(self, employee_id: str, leave_type: str, year: Optional[int] = None) -> list[LeaveRequest]:
        query = (
            select(LeaveRequest)
            .where(
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.leave_type == leave_type,
                LeaveRequest.status == "Pending",
            )
        )
        if year is not None:
            query = query.where(
                LeaveRequest.start_date >= date(year, 1, 1),
                LeaveRequest.start_date <= date(year, 12, 31),
            )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, data: dict) -> LeaveRequest:
        leave = LeaveRequest(**data)
        self.db.add(leave)
        await self.db.flush()
        await self.db.refresh(leave)
        return leave

    async def update(self, leave: LeaveRequest, data: dict) -> LeaveRequest:
        for key, value in data.items():
            setattr(leave, key, value)
        await self.db.flush()
        await self.db.refresh(leave)
        return leave
