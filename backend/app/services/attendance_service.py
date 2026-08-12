from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status

from app.core.time import now_pkt
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.attendance import AttendanceResponse, TodayAttendanceRow

# Attendance marking window, PKT minutes-since-midnight. Marking is accepted
# anywhere in [OPEN, CLOSE); at or after ON_TIME_CUTOFF the record is written
# as "Late" instead of "Present". Named constants rather than inline
# arithmetic because these three boundaries are the whole policy, and the
# frontend mirrors them in attendanceWindowNow (orbit-client.js) — if they
# ever change, both sides have to move together.
WINDOW_OPEN_MIN = 10 * 60          # 10:00 AM
ON_TIME_CUTOFF_MIN = 10 * 60 + 40  # 10:40 AM
WINDOW_CLOSE_MIN = 19 * 60         # 7:00 PM


class AttendanceService:
    def __init__(
        self,
        attendance_repo: AttendanceRepository,
        employee_repo: EmployeeRepository,
        notification_repo=None,
        wfh_repo=None,
        leave_repo=None,
        holiday_repo=None,
    ):
        self.attendance_repo = attendance_repo
        self.employee_repo = employee_repo
        self.notification_repo = notification_repo
        self.wfh_repo = wfh_repo
        self.leave_repo = leave_repo
        self.holiday_repo = holiday_repo

    async def _leave_info(self, leave_request_id: Optional[str]) -> tuple[Optional[str], Optional[str]]:
        """(approver_name, leave_type) for a status=="Leave" record — sparse
        per month, so a per-row lookup here is fine rather than a bulk join."""
        if not leave_request_id or not self.leave_repo:
            return None, None
        leave = await self.leave_repo.find_by_id(leave_request_id)
        if not leave:
            return None, None
        approver_name = None
        if leave.approved_by_id and self.employee_repo:
            approver = await self.employee_repo.find_by_id(leave.approved_by_id)
            approver_name = approver.name if approver else None
        return approver_name, leave.leave_type

    async def mark_attendance(self, employee_id: str) -> AttendanceResponse:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

        now = now_pkt()
        today = now.date()
        # Checked before the weekend/hours gates below since it's the most
        # specific, most informative reason when it applies (a company
        # holiday can land on a weekday) — same actual-enforcement reasoning
        # as those two: the frontend greys the button out, but this is what
        # stops a direct API call from sneaking a record in anyway.
        if self.holiday_repo:
            holidays_today = await self.holiday_repo.find_overlapping(today, today)
            if holidays_today:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Today is a holiday ({holidays_today[0].name}) — attendance can't be marked.",
                )
        # Saturday/Sunday aren't working days — the frontend already hides/
        # greys out the Mark Attendance button on weekends, but that's just
        # UI; this is the actual enforcement so a direct API call (or a
        # request that lands right at the Friday/Saturday midnight boundary)
        # can't sneak a weekend attendance record in. Matches
        # run_end_of_day_sweep's own weekend no-op below.
        if today.weekday() > 4:  # Mon=0 ... Fri=4, Sat=5, Sun=6
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attendance can't be marked on weekends — Saturday and Sunday aren't working days.",
            )
        # Marking window: 10:00 AM - 7:00 PM PKT on a working day, with an
        # on-time cutoff at 10:40 AM — mark at or after that and the record
        # says "Late" rather than "Present". Same "frontend greys it out,
        # backend actually enforces it" reasoning as the weekend check above.
        # Minute-precision since none of the boundaries are on the hour.
        current_minutes = now.hour * 60 + now.minute
        if not (WINDOW_OPEN_MIN <= current_minutes < WINDOW_CLOSE_MIN):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attendance can only be marked between 10:00 AM and 7:00 PM.",
            )
        is_late = current_minutes >= ON_TIME_CUTOFF_MIN
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

        # An approved WFH day should read as "WFH", not a plain "Present",
        # even when the employee proactively marks attendance instead of
        # being picked up by run_end_of_day_sweep's own WFH check below —
        # same rule, just enforced at the earlier of the two points it can
        # apply. WFH also outranks "Late": the status column holds one value,
        # and on an approved work-from-home day the fact that it was approved
        # WFH is the thing worth keeping, not what time they checked in.
        wfh = await self.wfh_repo.find_approved_for_employee_and_date(employee_id, today) if self.wfh_repo else None
        record = await self.attendance_repo.create({
            "employee_id": employee_id,
            "date": today,
            "status": "WFH" if wfh else "Late" if is_late else "Present",
            "marked_at": now_pkt(),
        })
        return AttendanceResponse(
            id=record.id, employee_id=record.employee_id,
            employee_name=employee.name, employee_department=employee.department,
            date=record.date, status=record.status, marked_at=record.marked_at,
        )

    @staticmethod
    def _month_bounds(year: int, month: int) -> tuple[date, date]:
        start = date(year, month, 1)
        end = (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)
        return start, end

    async def _holiday_dates_in_range(self, start: date, end: date) -> dict[date, str]:
        """{date: holiday_name} for every day in [start, end] covered by a
        holiday — used to fill in a "Holiday" status for dates that have no
        attendance row at all (a holiday, like a weekend, is never swept to
        Absent, so without this the day would otherwise just look like
        "nothing happened" instead of explaining why)."""
        if not self.holiday_repo:
            return {}
        holidays = await self.holiday_repo.find_overlapping(start, end)
        out: dict[date, str] = {}
        for h in holidays:
            d = max(h.date, start)
            h_end = min(h.end_date or h.date, end)
            while d <= h_end:
                out[d] = h.name
                d += timedelta(days=1)
        return out

    async def get_my_attendance(self, employee_id: str, year: int, month: int) -> list[AttendanceResponse]:
        rows = await self.attendance_repo.find_for_month_with_employee(year, month, employee_id=employee_id)
        out = []
        covered_dates = set()
        for r, e in rows:
            covered_dates.add(r.date)
            approver_name, leave_type = await self._leave_info(r.leave_request_id)
            out.append(AttendanceResponse(
                id=r.id, employee_id=r.employee_id, employee_name=e.name, employee_department=e.department,
                date=r.date, status=r.status, marked_at=r.marked_at,
                leave_approved_by_name=approver_name, leave_type=leave_type,
            ))

        month_start, month_end = self._month_bounds(year, month)
        holiday_dates = await self._holiday_dates_in_range(month_start, month_end)
        if holiday_dates:
            employee = await self.employee_repo.find_by_id(employee_id)
            for d, name in holiday_dates.items():
                if d in covered_dates:
                    continue
                out.append(AttendanceResponse(
                    id=f"holiday-{employee_id}-{d.isoformat()}", employee_id=employee_id,
                    employee_name=employee.name if employee else None,
                    employee_department=employee.department if employee else None,
                    date=d, status="Holiday", marked_at=None,
                ))
        out.sort(key=lambda r: r.date, reverse=True)
        return out

    async def get_all_attendance(self, year: int, month: int, employee_id: Optional[str] = None) -> list[AttendanceResponse]:
        rows = await self.attendance_repo.find_for_month_with_employee(year, month, employee_id=employee_id)
        out = []
        covered = set()
        for r, e in rows:
            covered.add((r.employee_id, r.date))
            approver_name, leave_type = await self._leave_info(r.leave_request_id)
            out.append(AttendanceResponse(
                id=r.id, employee_id=r.employee_id, employee_name=e.name, employee_department=e.department,
                date=r.date, status=r.status, marked_at=r.marked_at,
                leave_approved_by_name=approver_name, leave_type=leave_type,
            ))

        month_start, month_end = self._month_bounds(year, month)
        holiday_dates = await self._holiday_dates_in_range(month_start, month_end)
        if holiday_dates:
            if employee_id:
                employee = await self.employee_repo.find_by_id(employee_id)
                employees = [employee] if employee else []
            else:
                employees = await self.employee_repo.find_all(status_filter="Active", page_size=10000)
            for emp in employees:
                for d in holiday_dates:
                    if (emp.id, d) in covered:
                        continue
                    out.append(AttendanceResponse(
                        id=f"holiday-{emp.id}-{d.isoformat()}", employee_id=emp.id,
                        employee_name=emp.name, employee_department=emp.department,
                        date=d, status="Holiday", marked_at=None,
                    ))
        out.sort(key=lambda r: r.date, reverse=True)
        return out

    async def get_today_snapshot(self) -> list[TodayAttendanceRow]:
        today = now_pkt().date()
        rows = await self.attendance_repo.find_for_month_with_employee(today.year, today.month)
        marked_by_emp = {r.employee_id: r for r, _ in rows if r.date == today}
        is_holiday_today = bool(await self._holiday_dates_in_range(today, today))

        employees = await self.employee_repo.find_all(status_filter="Active", page_size=10000)
        out = []
        for emp in employees:
            record = marked_by_emp.get(emp.id)
            if record:
                out.append(TodayAttendanceRow(
                    employee_id=emp.id, employee_name=emp.name, employee_department=emp.department,
                    status=record.status, marked_at=record.marked_at,
                ))
            elif is_holiday_today:
                out.append(TodayAttendanceRow(
                    employee_id=emp.id, employee_name=emp.name, employee_department=emp.department,
                    status="Holiday", marked_at=None,
                ))
            else:
                out.append(TodayAttendanceRow(
                    employee_id=emp.id, employee_name=emp.name, employee_department=emp.department,
                    status="Not Marked Yet", marked_at=None,
                ))
        return out

    async def run_end_of_day_sweep(self, day: Optional[date] = None) -> int:
        """Marks every active employee who never checked in on `day` (default:
        today, PKT) as Absent, and notifies them. No-ops entirely for
        Saturday/Sunday or a declared company holiday — neither is a working
        day, so nobody is marked absent on them. Safe to call more than once
        for the same day: an employee already marked Present or already
        swept as Absent is simply skipped (the query only ever returns
        employees with zero attendance row for the day)."""
        target_day = day or now_pkt().date()
        if target_day.weekday() > 4:  # Mon=0 ... Fri=4, Sat=5, Sun=6
            return 0
        if self.holiday_repo:
            holidays = await self.holiday_repo.find_overlapping(target_day, target_day)
            if holidays:
                return 0

        missing = await self.attendance_repo.find_active_employees_without_record(target_day)
        absent_count = 0
        for emp in missing:
            # An approved work-from-home day counts as worked, not absent —
            # nobody who got WFH approved for today should get swept to
            # Absent just because they never physically checked in.
            wfh = await self.wfh_repo.find_approved_for_employee_and_date(emp.id, target_day) if self.wfh_repo else None
            if wfh:
                await self.attendance_repo.create({
                    "employee_id": emp.id, "date": target_day, "status": "WFH", "marked_at": None,
                })
                continue

            # Same for approved leave. Leave requests can only be filed for
            # today or a future date (see LeaveService.create_leave) — so by
            # the time this sweep runs for `target_day` at end of day, any
            # leave covering it has already been decided. This is the only
            # place Leave vs Absent ever gets decided; there's no later
            # retroactive fix-up needed.
            leave = await self.leave_repo.find_approved_for_employee_and_date(emp.id, target_day) if self.leave_repo else None
            if leave:
                await self.attendance_repo.create({
                    "employee_id": emp.id, "date": target_day, "status": "Leave",
                    "marked_at": None, "leave_request_id": leave.id,
                })
                continue

            await self.attendance_repo.create({
                "employee_id": emp.id,
                "date": target_day,
                "status": "Absent",
                "marked_at": None,
            })
            absent_count += 1
            if self.notification_repo:
                await self.notification_repo.create(
                    user_id=emp.id,
                    notif_type="Attendance",
                    title="Marked absent",
                    message=f"You have been marked absent for {target_day.strftime('%d %b %Y')} — no attendance was recorded.",
                )
        return absent_count
