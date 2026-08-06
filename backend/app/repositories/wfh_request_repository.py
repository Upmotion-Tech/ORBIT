from datetime import date

from sqlalchemy import select, func
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
        """The approved WFH request covering `day`, if any. A request spans
        [date, end_date-or-date] — COALESCE keeps every pre-existing
        single-day row (end_date NULL) matching exactly as it always did,
        same pattern as HolidayRepository.find_overlapping. This is what
        both AttendanceService.mark_attendance and run_end_of_day_sweep use
        to decide WFH vs Present/Absent, so a mid-range day resolves
        correctly without either of them needing to know about ranges."""
        result = await self.db.execute(
            select(WfhRequest).where(
                WfhRequest.employee_id == employee_id,
                WfhRequest.date <= day,
                func.coalesce(WfhRequest.end_date, WfhRequest.date) >= day,
                WfhRequest.status == "Approved",
            )
        )
        return result.scalars().first()

    async def find_overlapping_for_employee(self, employee_id: str, start: date, end: date) -> WfhRequest | None:
        """Any non-Rejected request of this employee's whose own range
        overlaps [start, end] — the range-aware replacement for what the
        (employee_id, date) unique constraint alone used to guarantee back
        when every request was a single day. Rejected ones are excluded so
        a rejected range doesn't permanently block re-requesting those days."""
        result = await self.db.execute(
            select(WfhRequest).where(
                WfhRequest.employee_id == employee_id,
                WfhRequest.status != "Rejected",
                WfhRequest.date <= end,
                func.coalesce(WfhRequest.end_date, WfhRequest.date) >= start,
            )
        )
        return result.scalars().first()

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

    async def delete(self, req: WfhRequest) -> None:
        # Hard delete — same reasoning as LeaveRepository.delete: only ever
        # reached for a still-Pending request the applicant withdrew, which
        # has no decision history to preserve. Also frees up that date range
        # again for a fresh request (both the (employee_id, date) unique
        # constraint and find_overlapping_for_employee would otherwise keep
        # treating the abandoned row as blocking those days).
        await self.db.delete(req)
        await self.db.flush()

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
