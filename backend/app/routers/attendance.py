from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_hr_user
from app.core.time import now_pkt
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.services.attendance_service import AttendanceService
from app.schemas.attendance import AttendanceResponse, TodayAttendanceRow

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


def get_attendance_service(db: AsyncSession = Depends(get_db)) -> AttendanceService:
    return AttendanceService(
        AttendanceRepository(db),
        EmployeeRepository(db),
        NotificationRepository(db),
    )


@router.post("/mark", response_model=AttendanceResponse)
async def mark_attendance(
    current_user: dict = Depends(get_current_user),
    service: AttendanceService = Depends(get_attendance_service),
):
    return await service.mark_attendance(current_user.get("user_id"))


@router.get("/me", response_model=list[AttendanceResponse])
async def get_my_attendance(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
    service: AttendanceService = Depends(get_attendance_service),
):
    today = now_pkt().date()
    return await service.get_my_attendance(current_user.get("user_id"), year or today.year, month or today.month)


@router.get("/today", response_model=list[TodayAttendanceRow])
async def get_today_attendance(
    current_user: dict = Depends(get_hr_user),
    service: AttendanceService = Depends(get_attendance_service),
):
    return await service.get_today_snapshot()


@router.get("", response_model=list[AttendanceResponse])
async def get_all_attendance(
    year: Optional[int] = None,
    month: Optional[int] = None,
    employee_id: Optional[str] = None,
    current_user: dict = Depends(get_hr_user),
    service: AttendanceService = Depends(get_attendance_service),
):
    today = now_pkt().date()
    return await service.get_all_attendance(year or today.year, month or today.month, employee_id=employee_id)
