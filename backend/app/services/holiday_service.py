from datetime import date
from typing import Optional

from fastapi import HTTPException, status

from app.repositories.holiday_repository import HolidayRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.attendance_repository import AttendanceRepository
from app.schemas.holiday import HolidayCreate, HolidayResponse
from app.models.holiday import Holiday
from app.core.permissions import has_role
from app.core.time import now_pkt


def _format_period(start: date, end: date) -> str:
    if start == end:
        return start.strftime("%d %b %Y")
    if start.year == end.year and start.month == end.month:
        return f"{start.day}–{end.strftime('%d %b %Y')}"
    return f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')}"


class HolidayService:
    def __init__(
        self,
        holiday_repo: HolidayRepository,
        employee_repo: Optional[EmployeeRepository] = None,
        notification_repo: Optional[NotificationRepository] = None,
        attendance_repo: Optional[AttendanceRepository] = None,
    ):
        self.holiday_repo = holiday_repo
        self.employee_repo = employee_repo
        self.notification_repo = notification_repo
        self.attendance_repo = attendance_repo

    def _to_response(self, holiday: Holiday) -> HolidayResponse:
        end = holiday.end_date or holiday.date
        day_count = (end - holiday.date).days + 1
        return HolidayResponse(
            id=holiday.id, name=holiday.name, date=holiday.date,
            end_date=holiday.end_date, day_count=day_count,
        )

    async def list_holidays(self) -> list[HolidayResponse]:
        holidays = await self.holiday_repo.find_all()
        return [self._to_response(h) for h in holidays]

    async def create_holiday(self, data: dict, persona=None) -> HolidayResponse:
        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner can add holidays.",
            )

        start = data["date"]
        end = data.get("end_date") or start
        if end < start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="End date can't be before start date.",
            )

        holiday = await self.holiday_repo.create(data)

        # Retroactive cleanup — a holiday can be declared after the fact
        # (e.g. added today for a range that started last week). Any date in
        # that range up to today may already have "Present" rows from
        # employees who marked themselves in before the holiday existed;
        # those are now wrong and get erased (marked_at goes with the row).
        # A date still in the future can't have an attendance row yet, so
        # there's nothing to clean up beyond today.
        today = now_pkt().date()
        cleanup_end = min(end, today)
        if self.attendance_repo and start <= cleanup_end:
            await self.attendance_repo.erase_present_in_range(start, cleanup_end)

        # Notify every active employee individually — never a user_id="all"
        # broadcast (NotificationRepository.find_all_for_user deliberately
        # only resolves "all" for owner/admin, so that would silently reach
        # no one but the Owner).
        if self.notification_repo and self.employee_repo:
            employees = await self.employee_repo.find_all(status_filter="Active", page_size=10000)
            period = _format_period(start, end)
            for emp in employees:
                await self.notification_repo.create(
                    user_id=emp.id,
                    notif_type="Holiday",
                    title="Holiday Announced",
                    message=f"{holiday.name} — {period}. No attendance is required.",
                )

        return self._to_response(holiday)

    async def delete_holiday(self, holiday_id: str, persona=None) -> None:
        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner can delete holidays.",
            )

        holiday = await self.holiday_repo.find_by_id(holiday_id)
        if not holiday:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Holiday not found.",
            )

        await self.holiday_repo.delete(holiday)
