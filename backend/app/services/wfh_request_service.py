from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException, status

from app.core.time import now_pkt
from app.core.permissions import has_role
from app.repositories.wfh_request_repository import WfhRequestRepository
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.wfh_request import WfhRequestResponse

HALF_DAY_VALUES = {"First Half", "Second Half"}


class WfhRequestService:
    def __init__(
        self,
        wfh_repo: WfhRequestRepository,
        employee_repo: EmployeeRepository,
        notification_repo=None,
        attendance_repo=None,
    ):
        self.wfh_repo = wfh_repo
        self.employee_repo = employee_repo
        self.notification_repo = notification_repo
        self.attendance_repo = attendance_repo

    @staticmethod
    def _range_label(req) -> str:
        """"03 Aug 2026" for a single day, "03 Aug 2026 - 05 Aug 2026" for a
        range — shared by every notification below so an approved multi-day
        request never reads as if only its first day were covered."""
        if req.end_date is None or req.end_date == req.date:
            return req.date.strftime("%d %b %Y")
        return f"{req.date.strftime('%d %b %Y')} - {req.end_date.strftime('%d %b %Y')}"

    @staticmethod
    def _validate_half_day(half_day: Optional[str], day: date, end_day: Optional[date]) -> None:
        if not half_day:
            return
        if half_day not in HALF_DAY_VALUES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='half_day must be "First Half" or "Second Half".',
            )
        if end_day and end_day != day:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A half-day request can only cover a single day, not a date range.",
            )

    def _to_response(self, req, employee) -> WfhRequestResponse:
        # end_date stays None for a single-day request rather than being
        # echoed back as a copy of `date` — the frontend keys off exactly
        # that to decide whether to render "3 Aug" or "3 Aug — 5 Aug".
        last_day = req.end_date or req.date
        days = 0.5 if req.half_day else (last_day - req.date).days + 1
        return WfhRequestResponse(
            id=req.id, employee_id=req.employee_id,
            employee_name=employee.name if employee else None,
            employee_department=employee.department if employee else None,
            date=req.date, end_date=req.end_date, half_day=req.half_day,
            days=days,
            description=req.description, status=req.status,
            decision_note=req.decision_note, decided_by=req.decided_by, decided_at=req.decided_at,
            created_at=req.created_at,
        )

    async def create_request(self, employee_id: str, day: date, description: Optional[str], user: str = "anonymous", end_day: Optional[date] = None, half_day: Optional[str] = None) -> WfhRequestResponse:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

        # A range that ends before it starts is nonsense, and one that ends
        # on its own start day is just a single-day request written the long
        # way — normalize that back to None so there's exactly one stored
        # representation of "one day" (see WfhRequest.end_date's comment).
        if end_day is not None:
            if end_day < day:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date cannot be before the start date.",
                )
            if end_day == day:
                end_day = None
        self._validate_half_day(half_day, day, end_day)

        last_day = end_day or day
        existing = await self.wfh_repo.find_overlapping_for_employee(employee_id, day, last_day)
        if existing:
            existing_last = existing.end_date or existing.date
            existing_range = (
                existing.date.isoformat() if existing.end_date is None
                else f"{existing.date.isoformat()} to {existing_last.isoformat()}"
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A work-from-home request already exists for {existing_range}.",
            )

        req = await self.wfh_repo.create({
            "employee_id": employee_id,
            "date": day,
            "end_date": end_day,
            "half_day": half_day,
            "description": description,
            "status": "Pending",
        })

        if self.notification_repo:
            # Same targeting fix as Leave Submitted — only the employee's
            # actual manager needs to know, not every "hr"/"owner"
            # access-level holder. Falls back to "owner" if no manager is on
            # file so the request never goes completely unnoticed.
            manager = await self.employee_repo.find_by_exact_name(employee.manager) if employee.manager else None
            await self.notification_repo.create(
                user_id=manager.id if manager else "owner",
                notif_type="WFH Requested",
                title="Work-from-home request submitted",
                message=f"{employee.name} requested to work from home on {self._range_label(req)}.",
                related_type="wfh",
                related_id=req.id,
            )

        return self._to_response(req, employee)

    async def list_my_requests(self, employee_id: str) -> list[WfhRequestResponse]:
        rows = await self.wfh_repo.find_for_employee_with_name(employee_id)
        return [self._to_response(r, e) for r, e in rows]

    async def list_all_requests(self, status_filter: Optional[str] = None) -> list[WfhRequestResponse]:
        rows = await self.wfh_repo.find_all_with_name(status_filter)
        return [self._to_response(r, e) for r, e in rows]

    async def _own_pending_request(self, request_id: str, user_id: str):
        """Mirror of LeaveService._own_pending_leave — a request is only the
        applicant's to change while it's still Pending. Once decided it's a
        record (and an approved one may already have driven attendance rows
        to WFH via _apply_attendance_effect), so changing it belongs to
        whoever decided it."""
        req = await self.wfh_repo.find_by_id(request_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work-from-home request not found.")
        if req.employee_id != user_id:
            # 404 rather than 403, so this can't be used to probe whether
            # someone else's request with this id exists.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work-from-home request not found.")
        if req.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This request has already been {req.status.lower()} and can no longer be changed.",
            )
        return req

    async def update_own_request(self, request_id: str, data: dict, user_id: str) -> WfhRequestResponse:
        req = await self._own_pending_request(request_id, user_id)

        day = data.get("date") or req.date
        end_day = data.get("end_date") if "end_date" in data else req.end_date
        if end_day is not None:
            if end_day < day:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="End date cannot be before the start date.",
                )
            if end_day == day:
                end_day = None
        half_day = data.get("half_day") if "half_day" in data else req.half_day
        self._validate_half_day(half_day, day, end_day)

        # Same overlap rule as create_request, but this request's own row
        # must not count as a conflict with itself.
        clash = await self.wfh_repo.find_overlapping_for_employee(user_id, day, end_day or day)
        if clash and clash.id != req.id:
            clash_last = clash.end_date or clash.date
            clash_range = (
                clash.date.isoformat() if clash.end_date is None
                else f"{clash.date.isoformat()} to {clash_last.isoformat()}"
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A work-from-home request already exists for {clash_range}.",
            )

        data["date"] = day
        data["end_date"] = end_day
        data["half_day"] = half_day
        req = await self.wfh_repo.update(req, data)
        employee = await self.employee_repo.find_by_id(req.employee_id)
        return self._to_response(req, employee)

    async def delete_own_request(self, request_id: str, user_id: str) -> None:
        req = await self._own_pending_request(request_id, user_id)
        await self.wfh_repo.delete(req)

    async def _apply_attendance_effect(self, req) -> None:
        # Retroactively fix existing attendance rows across the request's
        # whole range (e.g. one the end-of-day sweep already marked Absent
        # before this request was approved) — this only matters for a
        # request approved after its own date(s) already passed.
        #
        # Only for a FULL-day request (half_day is None). A half-day WFH
        # doesn't excuse the employee from checking in for the other,
        # required half — AttendanceService still expects a real mark_attendance
        # call for that half, timed against its own slot, and that's what
        # should end up in the record (Present/Late/Absent), not a blanket
        # "WFH" overwrite. Full-day WFH still gets this fix-up since there's
        # no other half to account for.
        if not self.attendance_repo or req.half_day:
            return
        day = req.date
        last_day = req.end_date or req.date
        while day <= last_day:
            existing = await self.attendance_repo.find_by_employee_and_date(req.employee_id, day)
            if existing and existing.status != "WFH":
                await self.attendance_repo.update_status(existing, "WFH")
            day += timedelta(days=1)

    async def approve_request(self, request_id: str, note: Optional[str], decided_by: str, persona=None) -> WfhRequestResponse:
        req = await self.wfh_repo.find_by_id(request_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work-from-home request not found.")
        
        is_manager = False
        actor_emp = None
        if decided_by and self.employee_repo:
            actor_emp = await self.employee_repo.find_by_id(decided_by)
            wfh_emp = await self.employee_repo.find_by_id(req.employee_id)
            if actor_emp and wfh_emp and wfh_emp.manager and wfh_emp.manager.strip().lower() == actor_emp.name.strip().lower():
                is_manager = True

        if not (has_role(persona, "hr", "owner") or is_manager):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only HR, Owner, or the employee's manager can approve work-from-home requests.")
        if req.status != "Pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be approved.")

        req = await self.wfh_repo.update(req, {
            "status": "Approved", "decision_note": note, "decided_by": decided_by, "decided_at": now_pkt(),
        })
        await self._apply_attendance_effect(req)

        employee = await self.employee_repo.find_by_id(req.employee_id)
        if self.notification_repo:
            by_suffix = f" by {actor_emp.name}" if actor_emp else ""
            note_suffix = f" Note: {note}" if note else ""
            await self.notification_repo.create(
                user_id=req.employee_id,
                notif_type="WFH Approved",
                title="Work-from-home request approved",
                message=f"Your work-from-home request for {self._range_label(req)} was approved{by_suffix}.{note_suffix}",
                related_type="wfh",
                related_id=req.id,
            )
        return self._to_response(req, employee)

    async def reject_request(self, request_id: str, note: Optional[str], decided_by: str, persona=None) -> WfhRequestResponse:
        req = await self.wfh_repo.find_by_id(request_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work-from-home request not found.")
        
        is_manager = False
        actor_emp = None
        if decided_by and self.employee_repo:
            actor_emp = await self.employee_repo.find_by_id(decided_by)
            wfh_emp = await self.employee_repo.find_by_id(req.employee_id)
            if actor_emp and wfh_emp and wfh_emp.manager and wfh_emp.manager.strip().lower() == actor_emp.name.strip().lower():
                is_manager = True

        if not (has_role(persona, "hr", "owner") or is_manager):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only HR, Owner, or the employee's manager can reject work-from-home requests.")
        if req.status != "Pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be rejected.")


        req = await self.wfh_repo.update(req, {
            "status": "Rejected", "decision_note": note, "decided_by": decided_by, "decided_at": now_pkt(),
        })

        employee = await self.employee_repo.find_by_id(req.employee_id)
        if self.notification_repo:
            by_suffix = f" by {actor_emp.name}" if actor_emp else ""
            note_suffix = f" Reason: {note}" if note else ""
            await self.notification_repo.create(
                user_id=req.employee_id,
                notif_type="WFH Rejected",
                title="Work-from-home request rejected",
                message=f"Your work-from-home request for {self._range_label(req)} was rejected{by_suffix}.{note_suffix}",
                related_type="wfh",
                related_id=req.id,
            )
        return self._to_response(req, employee)
