from datetime import date

from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.employee import Employee


class AttendanceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_by_employee_and_date(self, employee_id: str, day: date) -> AttendanceRecord | None:
        result = await self.db.execute(
            select(AttendanceRecord).where(
                and_(AttendanceRecord.employee_id == employee_id, AttendanceRecord.date == day)
            )
        )
        return result.scalar_one_or_none()

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

    async def find_active_employees_without_record(self, day: date) -> list[Employee]:
        # Every active employee who has no attendance row at all for `day` —
        # the exact set the end-of-day sweep needs to mark Absent.
        subq = select(AttendanceRecord.employee_id).where(AttendanceRecord.date == day)
        result = await self.db.execute(
            select(Employee).where(
                Employee.deleted_at.is_(None),
                Employee.is_active.is_(True),
                Employee.id.notin_(subq),
            )
        )
        return list(result.scalars().all())

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
