from datetime import date
from typing import Optional

from fastapi import HTTPException, status

from app.core.time import now_pkt
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.attendance import AttendanceResponse, TodayAttendanceRow


class AttendanceService:
    def __init__(
        self,
        attendance_repo: AttendanceRepository,
        employee_repo: EmployeeRepository,
        notification_repo=None,
    ):
        self.attendance_repo = attendance_repo
        self.employee_repo = employee_repo
        self.notification_repo = notification_repo

    async def mark_attendance(self, employee_id: str) -> AttendanceResponse:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

        today = now_pkt().date()
        existing = await self.attendance_repo.find_by_employee_and_date(employee_id, today)
        if existing:
            # Idempotent — re-clicking Mark Attendance after already marking
            # today just returns the original record instead of erroring or
            # creating a duplicate (the DB's own unique constraint on
            # (employee_id, date) would reject a second insert anyway).
            return AttendanceResponse(
                id=existing.id, employee_id=existing.employee_id,
                employee_name=employee.name, employee_department=employee.department,
                date=existing.date, status=existing.status, marked_at=existing.marked_at,
            )

        record = await self.attendance_repo.create({
            "employee_id": employee_id,
            "date": today,
            "status": "Present",
            "marked_at": now_pkt(),
        })
        return AttendanceResponse(
            id=record.id, employee_id=record.employee_id,
            employee_name=employee.name, employee_department=employee.department,
            date=record.date, status=record.status, marked_at=record.marked_at,
        )

    async def get_my_attendance(self, employee_id: str, year: int, month: int) -> list[AttendanceResponse]:
        rows = await self.attendance_repo.find_for_month_with_employee(year, month, employee_id=employee_id)
        return [
            AttendanceResponse(
                id=r.id, employee_id=r.employee_id, employee_name=e.name, employee_department=e.department,
                date=r.date, status=r.status, marked_at=r.marked_at,
            )
            for r, e in rows
        ]

    async def get_all_attendance(self, year: int, month: int, employee_id: Optional[str] = None) -> list[AttendanceResponse]:
        rows = await self.attendance_repo.find_for_month_with_employee(year, month, employee_id=employee_id)
        return [
            AttendanceResponse(
                id=r.id, employee_id=r.employee_id, employee_name=e.name, employee_department=e.department,
                date=r.date, status=r.status, marked_at=r.marked_at,
            )
            for r, e in rows
        ]

    async def get_today_snapshot(self) -> list[TodayAttendanceRow]:
        today = now_pkt().date()
        rows = await self.attendance_repo.find_for_month_with_employee(today.year, today.month)
        marked_by_emp = {r.employee_id: r for r, _ in rows if r.date == today}

        employees = await self.employee_repo.find_all(status_filter="Active", page_size=10000)
        out = []
        for emp in employees:
            record = marked_by_emp.get(emp.id)
            if record:
                out.append(TodayAttendanceRow(
                    employee_id=emp.id, employee_name=emp.name, employee_department=emp.department,
                    status=record.status, marked_at=record.marked_at,
                ))
            else:
                out.append(TodayAttendanceRow(
                    employee_id=emp.id, employee_name=emp.name, employee_department=emp.department,
                    status="Not Marked Yet", marked_at=None,
                ))
        return out

    async def run_end_of_day_sweep(self, day: Optional[date] = None) -> int:
        """Marks every active employee who never checked in on `day` (default:
        today, PKT) as Absent, and notifies them. Only runs for Monday-Friday
        — weekends aren't working days, so nobody is marked absent on them.
        Safe to call more than once for the same day: an employee already
        marked Present or already swept as Absent is simply skipped (the
        query only ever returns employees with zero attendance row for the
        day)."""
        target_day = day or now_pkt().date()
        if target_day.weekday() > 4:  # Mon=0 ... Fri=4, Sat=5, Sun=6
            return 0

        missing = await self.attendance_repo.find_active_employees_without_record(target_day)
        for emp in missing:
            await self.attendance_repo.create({
                "employee_id": emp.id,
                "date": target_day,
                "status": "Absent",
                "marked_at": None,
            })
            if self.notification_repo:
                await self.notification_repo.create(
                    user_id=emp.id,
                    notif_type="Attendance",
                    title="Marked absent",
                    message=f"You have been marked absent for {target_day.strftime('%d %b %Y')} — no attendance was recorded.",
                )
        return len(missing)
