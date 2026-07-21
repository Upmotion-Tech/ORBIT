from datetime import date
from typing import Optional

from fastapi import HTTPException, status

from app.core.time import now_pkt
from app.core.permissions import has_role
from app.repositories.wfh_request_repository import WfhRequestRepository
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.wfh_request import WfhRequestResponse


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

    def _to_response(self, req, employee) -> WfhRequestResponse:
        return WfhRequestResponse(
            id=req.id, employee_id=req.employee_id,
            employee_name=employee.name if employee else None,
            employee_department=employee.department if employee else None,
            date=req.date, description=req.description, status=req.status,
            decision_note=req.decision_note, decided_by=req.decided_by, decided_at=req.decided_at,
            created_at=req.created_at,
        )

    async def create_request(self, employee_id: str, day: date, description: Optional[str], user: str = "anonymous") -> WfhRequestResponse:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

        existing = await self.wfh_repo.find_by_employee_and_date(employee_id, day)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A work-from-home request already exists for {day.isoformat()}.",
            )

        req = await self.wfh_repo.create({
            "employee_id": employee_id,
            "date": day,
            "description": description,
            "status": "Pending",
        })

        if self.notification_repo:
            for target in ("hr", "owner"):
                await self.notification_repo.create(
                    user_id=target,
                    notif_type="WFH Requested",
                    title="Work-from-home request submitted",
                    message=f"{employee.name} requested to work from home on {day.strftime('%d %b %Y')}.",
                )

        return self._to_response(req, employee)

    async def list_my_requests(self, employee_id: str) -> list[WfhRequestResponse]:
        rows = await self.wfh_repo.find_for_employee_with_name(employee_id)
        return [self._to_response(r, e) for r, e in rows]

    async def list_all_requests(self, status_filter: Optional[str] = None) -> list[WfhRequestResponse]:
        rows = await self.wfh_repo.find_all_with_name(status_filter)
        return [self._to_response(r, e) for r, e in rows]

    async def _apply_attendance_effect(self, req) -> None:
        # Retroactively fix an existing attendance row for that date (e.g.
        # one the end-of-day sweep already marked Absent before this request
        # was approved) — going forward, the sweep itself also checks for an
        # approved WFH request before ever marking someone Absent, so this
        # only matters for a request approved after its own date already
        # passed the sweep.
        if not self.attendance_repo:
            return
        existing = await self.attendance_repo.find_by_employee_and_date(req.employee_id, req.date)
        if existing and existing.status != "WFH":
            await self.attendance_repo.update_status(existing, "WFH")

    async def approve_request(self, request_id: str, note: Optional[str], decided_by: str, persona=None) -> WfhRequestResponse:
        req = await self.wfh_repo.find_by_id(request_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work-from-home request not found.")
        if not has_role(persona, "hr", "owner"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only HR can approve work-from-home requests.")
        if req.status != "Pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be approved.")

        req = await self.wfh_repo.update(req, {
            "status": "Approved", "decision_note": note, "decided_by": decided_by, "decided_at": now_pkt(),
        })
        await self._apply_attendance_effect(req)

        employee = await self.employee_repo.find_by_id(req.employee_id)
        if self.notification_repo:
            note_suffix = f" Note: {note}" if note else ""
            await self.notification_repo.create(
                user_id=req.employee_id,
                notif_type="WFH Approved",
                title="Work-from-home request approved",
                message=f"Your work-from-home request for {req.date.strftime('%d %b %Y')} was approved.{note_suffix}",
            )
        return self._to_response(req, employee)

    async def reject_request(self, request_id: str, note: Optional[str], decided_by: str, persona=None) -> WfhRequestResponse:
        req = await self.wfh_repo.find_by_id(request_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work-from-home request not found.")
        if not has_role(persona, "hr", "owner"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only HR can reject work-from-home requests.")
        if req.status != "Pending":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending requests can be rejected.")

        req = await self.wfh_repo.update(req, {
            "status": "Rejected", "decision_note": note, "decided_by": decided_by, "decided_at": now_pkt(),
        })

        employee = await self.employee_repo.find_by_id(req.employee_id)
        if self.notification_repo:
            note_suffix = f" Reason: {note}" if note else ""
            await self.notification_repo.create(
                user_id=req.employee_id,
                notif_type="WFH Rejected",
                title="Work-from-home request rejected",
                message=f"Your work-from-home request for {req.date.strftime('%d %b %Y')} was rejected.{note_suffix}",
            )
        return self._to_response(req, employee)
