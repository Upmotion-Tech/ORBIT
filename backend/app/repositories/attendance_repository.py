from datetime import date

from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.employee import Employee


class AttendanceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_employee_and_date(self, employee_id: str, day: date, half_day: str | None = None) -> AttendanceRecord | None:
        # half_day defaults to None (a normal, single full-day row) — every
        # pre-existing caller passes only employee_id/day and keeps working
        # unchanged. mark_attendance passes an explicit half when routing a
        # click to a specific half's row on a half-day Leave/WFH day.
        result = await self.db.execute(
            select(AttendanceRecord).where(
                and_(
                    AttendanceRecord.employee_id == employee_id,
                    AttendanceRecord.date == day,
                    AttendanceRecord.half_day == half_day,
                )
            )
        )
        return result.scalar_one_or_none()

    async def find_all_for_date(self, day: date) -> list[AttendanceRecord]:
        """Every row (any employee, any half) for one date — the sweep uses
        this to know exactly which (employee, half) combinations are already
        covered before deciding what's still missing."""
        result = await self.db.execute(select(AttendanceRecord).where(AttendanceRecord.date == day))
        return list(result.scalars().all())

    async def create(self, data: dict) -> AttendanceRecord:
        record = AttendanceRecord(**data)
        self.db.add(record)
        await self.db.flush()
        return record

    async def update_status(self, record: AttendanceRecord, status: str) -> AttendanceRecord:
        record.status = status
        await self.db.flush()
        return record

    async def find_for_month_with_employee(
        self, year: int, month: int, employee_id: str | None = None,
    ) -> list[tuple[AttendanceRecord, Employee]]:
        start = date(year, month, 1)
        end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
        query = (
            select(AttendanceRecord, Employee)
            .join(Employee, Employee.id == AttendanceRecord.employee_id)
            .where(AttendanceRecord.date >= start, AttendanceRecord.date < end)
            .order_by(AttendanceRecord.date.desc())
        )
        if employee_id:
            query = query.where(AttendanceRecord.employee_id == employee_id)
        result = await self.db.execute(query)
        return [(r[0], r[1]) for r in result.all()]

    async def erase_present_in_range(self, start: date, end: date) -> int:
        """Deletes any self-marked "Present" record whose date falls in
        [start, end] — used when a holiday is declared after the fact and
        some employees had already marked themselves present for a day
        that's now retroactively a holiday. Deleting the row removes the
        marked_at timestamp along with it, not just the status."""
        result = await self.db.execute(
            delete(AttendanceRecord).where(
                AttendanceRecord.date >= start,
                AttendanceRecord.date <= end,
                AttendanceRecord.status == "Present",
            )
        )
        await self.db.flush()
        return result.rowcount or 0
