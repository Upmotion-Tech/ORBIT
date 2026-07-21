from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.wfh_request import WfhRequest
from app.models.employee import Employee


class WfhRequestRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_id(self, request_id: str) -> WfhRequest | None:
        result = await self.db.execute(select(WfhRequest).where(WfhRequest.id == request_id))
        return result.scalar_one_or_none()

    async def find_by_employee_and_date(self, employee_id: str, day: date) -> WfhRequest | None:
        result = await self.db.execute(
            select(WfhRequest).where(WfhRequest.employee_id == employee_id, WfhRequest.date == day)
        )
        return result.scalar_one_or_none()

    async def find_approved_for_employee_and_date(self, employee_id: str, day: date) -> WfhRequest | None:
        result = await self.db.execute(
            select(WfhRequest).where(
                WfhRequest.employee_id == employee_id,
                WfhRequest.date == day,
                WfhRequest.status == "Approved",
            )
        )
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> WfhRequest:
        req = WfhRequest(**data)
        self.db.add(req)
        await self.db.flush()
        return req

    async def update(self, req: WfhRequest, data: dict) -> WfhRequest:
        for key, value in data.items():
            setattr(req, key, value)
        await self.db.flush()
        return req

    async def find_for_employee_with_name(self, employee_id: str) -> list[tuple[WfhRequest, Employee]]:
        result = await self.db.execute(
            select(WfhRequest, Employee)
            .join(Employee, Employee.id == WfhRequest.employee_id)
            .where(WfhRequest.employee_id == employee_id)
            .order_by(WfhRequest.date.desc())
        )
        return [(r[0], r[1]) for r in result.all()]

    async def find_all_with_name(self, status_filter: str | None = None) -> list[tuple[WfhRequest, Employee]]:
        query = (
            select(WfhRequest, Employee)
            .join(Employee, Employee.id == WfhRequest.employee_id)
            .order_by(WfhRequest.created_at.desc())
        )
        if status_filter:
            query = query.where(WfhRequest.status == status_filter)
        result = await self.db.execute(query)
        return [(r[0], r[1]) for r in result.all()]
