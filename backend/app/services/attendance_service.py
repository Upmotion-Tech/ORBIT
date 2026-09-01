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

# Half-day slots, for anyone with an approved First-Half or Second-Half
# Leave/WFH request. Each half is its own independently-markable window —
# see SLOT_RANGE below and mark_attendance's half-day branches.
FIRST_HALF_START_MIN = 10 * 60      # 10:00 AM
SECOND_HALF_START_MIN = 15 * 60     # 3:00 PM
HALF_ON_TIME_GRACE_MIN = 40         # same 40-minute grace as the normal window

# (start, end) PKT minutes-since-midnight of each half's own slot, [start,
# end) — First Half 10:00 AM-3:00 PM, Second Half 3:00-7:00 PM. Used to
# route "which half is `now` in" for whichever half is actively being
# marked: the WFH half itself (no lateness there), or the required
# non-leave/non-WFH half of a half-day Leave/WFH day (Present/Late as usual,
# timed against that half's own start).
SLOT_RANGE = {
    "First Half": (FIRST_HALF_START_MIN, SECOND_HALF_START_MIN),
    "Second Half": (SECOND_HALF_START_MIN, WINDOW_CLOSE_MIN),
}


def _format_minutes(minutes: int) -> str:
    """600 -> "10:00 AM", 900 -> "3:00 PM" — for error messages that need to
    name a shifted window's actual boundary rather than the normal one."""
    h, m = divmod(minutes, 60)
    period = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {period}"


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

    @staticmethod
    def _other_half(half: str) -> str:
        return "Second Half" if half == "First Half" else "First Half"

    async def _approved_leave_and_wfh(self, employee_id: str, day: date):
        """(leave, wfh) — the approved LeaveRequest/WfhRequest rows covering
        `day` for this employee, or None for whichever doesn't apply. Fetched
        together since mark_attendance needs both to decide what's required
        today: a half-day WFH needs both its own half AND the other,
        in-office half actively marked; a half-day Leave needs only the
        in-office half marked (nothing to confirm during the leave half
        itself); either FULL-day version is its own single-slot case."""
        leave = await self.leave_repo.find_approved_for_employee_and_date(employee_id, day) if self.leave_repo else None
        wfh = await self.wfh_repo.find_approved_for_employee_and_date(employee_id, day) if self.wfh_repo else None
        return leave, wfh

    @staticmethod
    def _to_attendance_response(record, employee) -> AttendanceResponse:
        return AttendanceResponse(
            id=record.id, employee_id=record.employee_id,
            employee_name=employee.name, employee_department=employee.department,
            date=record.date, half_day=record.half_day, status=record.status, marked_at=record.marked_at,
        )

    async def mark_attendance(self, employee_id: str) -> AttendanceResponse:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

        now = now_pkt()
        today = now.date()
        current_minutes = now.hour * 60 + now.minute
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

        leave, wfh = await self._approved_leave_and_wfh(employee_id, today)

        # Half-day WFH: BOTH halves need an active click — the WFH half
        # itself (no lateness there, just confirming it happened at all,
        # same "no free pass" reasoning as full-day WFH below) and the
        # other, in-office half (Present/Late as normal). Whichever slot
        # `now` falls in decides which of the two rows this click is for —
        # each half is its own independently-idempotent row.
        if wfh and wfh.half_day:
            wfh_half = wfh.half_day
            office_half = self._other_half(wfh_half)
            wfh_open, wfh_close = SLOT_RANGE[wfh_half]
            office_open, office_close = SLOT_RANGE[office_half]
            office_cutoff = office_open + HALF_ON_TIME_GRACE_MIN

            if wfh_open <= current_minutes < wfh_close:
                half_to_mark, status_value = wfh_half, "WFH"
            elif office_open <= current_minutes < office_close:
                half_to_mark = office_half
                status_value = "Late" if current_minutes >= office_cutoff else "Present"
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"You have approved WFH for the {wfh_half} today — mark your WFH half between "
                        f"{_format_minutes(wfh_open)} and {_format_minutes(wfh_close)}, or your office half "
                        f"between {_format_minutes(office_open)} and {_format_minutes(office_close)}."
                    ),
                )

            existing = await self.attendance_repo.find_by_employee_and_date(employee_id, today, half_day=half_to_mark)
            if existing:
                # Idempotent per HALF, not per day — re-clicking after
                # already marking THIS half returns that row unchanged; the
                # other half (if not yet marked) is still markable later.
                return self._to_attendance_response(existing, employee)
            record = await self.attendance_repo.create({
                "employee_id": employee_id, "date": today, "half_day": half_to_mark,
                "status": status_value, "marked_at": now_pkt(),
            })
            return self._to_attendance_response(record, employee)

        # Half-day Leave: only the non-leave half needs marking — there's
        # nothing to confirm during the leave half itself, same as a
        # full-day Leave needs no marking at all.
        if leave and leave.half_day:
            leave_half = leave.half_day
            office_half = self._other_half(leave_half)
            office_open, office_close = SLOT_RANGE[office_half]
            office_cutoff = office_open + HALF_ON_TIME_GRACE_MIN

            if not (office_open <= current_minutes < office_close):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"You have approved leave for the {leave_half} today — attendance can only be "
                        f"marked between {_format_minutes(office_open)} and {_format_minutes(office_close)}."
                    ),
                )
            existing = await self.attendance_repo.find_by_employee_and_date(employee_id, today, half_day=office_half)
            if existing:
                return self._to_attendance_response(existing, employee)
            record = await self.attendance_repo.create({
                "employee_id": employee_id, "date": today, "half_day": office_half,
                "status": "Late" if current_minutes >= office_cutoff else "Present", "marked_at": now_pkt(),
            })
            return self._to_attendance_response(record, employee)

        # Full-day Leave: no marking needed OR allowed — mirrors the leave
        # half of a half-day Leave day (also blocked above). Without this,
        # someone on approved leave who clicks Mark Attendance anyway would
        # silently overwrite what the end-of-day sweep would otherwise have
        # recorded as "Leave" with Present/Late instead. Skipped when a
        # full-day WFH is ALSO approved for today (nothing currently stops
        # that combination at request time) — that case still needs its own
        # WFH mark via the fallback below, same as it always has.
        is_full_day_wfh = bool(wfh and wfh.half_day is None)
        if leave and leave.half_day is None and not is_full_day_wfh:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have approved leave for today — attendance doesn't need to be marked.",
            )

        # Normal day, including a FULL-day approved WFH — doesn't shift the
        # window, uses the single ordinary full-day slot.
        if not (WINDOW_OPEN_MIN <= current_minutes < WINDOW_CLOSE_MIN):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attendance can only be marked between 10:00 AM and 7:00 PM.",
            )
        existing = await self.attendance_repo.find_by_employee_and_date(employee_id, today)
        if existing:
            return self._to_attendance_response(existing, employee)

        # A FULL-day approved WFH reads as "WFH", not Present/Late, once they
        # do mark — timing within the window doesn't matter, only that they
        # marked at all somewhere in it (run_end_of_day_sweep no longer
        # grants this automatically for a no-show, see there for why).
        is_late = current_minutes >= ON_TIME_CUTOFF_MIN
        record = await self.attendance_repo.create({
            "employee_id": employee_id,
            "date": today,
            "status": "WFH" if is_full_day_wfh else "Late" if is_late else "Present",
            "marked_at": now_pkt(),
        })
        return self._to_attendance_response(record, employee)

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
                date=r.date, half_day=r.half_day, status=r.status, marked_at=r.marked_at,
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
        out.sort(key=lambda r: (r.date, r.half_day or ""), reverse=True)
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
                date=r.date, half_day=r.half_day, status=r.status, marked_at=r.marked_at,
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
        out.sort(key=lambda r: (r.date, r.half_day or ""), reverse=True)
        return out

    async def get_today_snapshot(self) -> list[TodayAttendanceRow]:
        today = now_pkt().date()
        rows = await self.attendance_repo.find_for_month_with_employee(today.year, today.month)
        # A half-day Leave/WFH employee can have TWO rows for today — this is
        # a one-line-per-employee overview (TodayAttendanceRow has no
        # half_day field), so pick whichever is most current: the one with
        # the later marked_at, or if only one was ever actually marked
        # (marked_at set), prefer that over an auto-swept row with none.
        marked_by_emp: dict[str, object] = {}
        for r, _ in rows:
            if r.date != today:
                continue
            current = marked_by_emp.get(r.employee_id)
            if current is None:
                marked_by_emp[r.employee_id] = r
            elif r.marked_at and (not current.marked_at or r.marked_at > current.marked_at):
                marked_by_emp[r.employee_id] = r
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

    async def _notify_absent(self, employee_id: str, target_day: date) -> None:
        if self.notification_repo:
            await self.notification_repo.create(
                user_id=employee_id,
                notif_type="Attendance",
                title="Marked absent",
                message=f"You have been marked absent for {target_day.strftime('%d %b %Y')} — no attendance was recorded.",
            )

    async def run_end_of_day_sweep(self, day: Optional[date] = None) -> int:
        """Marks every active employee's still-missing slot(s) for `day`
        (default: today, PKT) as Absent, and notifies them once per employee.
        No-ops entirely for Saturday/Sunday or a declared company holiday —
        neither is a working day. Safe to call more than once for the same
        day: every create is guarded by an explicit (employee, half) already-
        covered check, so a second run creates nothing new and sends no
        duplicate notifications.

        Iterates every active employee (not just ones with zero rows) since
        a half-day Leave/WFH day can need up to two independent rows — an
        employee who already marked one half can still be missing the
        other."""
        target_day = day or now_pkt().date()
        if target_day.weekday() > 4:  # Mon=0 ... Fri=4, Sat=5, Sun=6
            return 0
        if self.holiday_repo:
            holidays = await self.holiday_repo.find_overlapping(target_day, target_day)
            if holidays:
                return 0

        employees = await self.employee_repo.find_all(status_filter="Active", page_size=10000)
        existing = await self.attendance_repo.find_all_for_date(target_day)
        covered = {(r.employee_id, r.half_day) for r in existing}

        absent_count = 0
        for emp in employees:
            leave, wfh = await self._approved_leave_and_wfh(emp.id, target_day)

            if leave and leave.half_day is None:
                # Full-day leave: the one real exemption — nothing to check
                # in for when not working at all that day. Leave requests
                # can only be filed for today or a future date (see
                # LeaveService.create_leave), so by sweep time any leave
                # covering target_day has already been decided — the only
                # place Leave vs Absent is ever decided for a full day, no
                # later retroactive fix-up needed.
                if (emp.id, None) not in covered:
                    await self.attendance_repo.create({
                        "employee_id": emp.id, "date": target_day, "status": "Leave",
                        "marked_at": None, "leave_request_id": leave.id,
                    })
                continue

            if wfh and wfh.half_day:
                # Half-day WFH: BOTH halves are a real obligation — the WFH
                # half itself is NOT auto-credited (same "no free pass" as
                # full-day WFH below) and neither is the other, in-office
                # half. Each one still missing becomes its own Absent row.
                office_half = self._other_half(wfh.half_day)
                was_absent = False
                for half in (wfh.half_day, office_half):
                    if (emp.id, half) not in covered:
                        await self.attendance_repo.create({
                            "employee_id": emp.id, "date": target_day, "half_day": half,
                            "status": "Absent", "marked_at": None,
                        })
                        was_absent = True
                if was_absent:
                    absent_count += 1
                    await self._notify_absent(emp.id, target_day)
                continue

            if leave and leave.half_day:
                # Half-day leave: the leave half needs no marking at all
                # (auto-covered here, same as a full day) — only the other,
                # in-office half is a real obligation.
                office_half = self._other_half(leave.half_day)
                if (emp.id, leave.half_day) not in covered:
                    await self.attendance_repo.create({
                        "employee_id": emp.id, "date": target_day, "half_day": leave.half_day,
                        "status": "Leave", "marked_at": None, "leave_request_id": leave.id,
                    })
                if (emp.id, office_half) not in covered:
                    await self.attendance_repo.create({
                        "employee_id": emp.id, "date": target_day, "half_day": office_half,
                        "status": "Absent", "marked_at": None,
                    })
                    absent_count += 1
                    await self._notify_absent(emp.id, target_day)
                continue

            # Normal day, including a full-day approved WFH — neither is
            # exempt from actually checking in (see mark_attendance for why
            # WFH lost its automatic credit here).
            if (emp.id, None) not in covered:
                await self.attendance_repo.create({
                    "employee_id": emp.id, "date": target_day, "status": "Absent", "marked_at": None,
                })
                absent_count += 1
                await self._notify_absent(emp.id, target_day)

        return absent_count
