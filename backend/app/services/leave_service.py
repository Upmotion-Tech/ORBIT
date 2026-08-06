from typing import Optional
from datetime import date, datetime

from fastapi import HTTPException, status

from app.repositories.leave_repository import LeaveRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.leave_policy_repository import LeavePolicyRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.leave import LeaveCreate, LeaveResponse, LeaveBalanceResponse
from app.models.leave_request import LeaveRequest
from app.models.employee import Employee
from app.core.time import now_pkt
from app.core.permissions import has_role


class LeaveService:
    def __init__(
        self,
        leave_repo: LeaveRepository,
        employee_repo: Optional[EmployeeRepository] = None,
        leave_policy_repo: Optional[LeavePolicyRepository] = None,
        notification_repo: Optional[NotificationRepository] = None,
        audit_repo = None,
    ):
        self.leave_repo = leave_repo
        self.employee_repo = employee_repo
        self.leave_policy_repo = leave_policy_repo
        self.notification_repo = notification_repo
        self.audit_repo = audit_repo

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Leave Request", label, detail)

    async def list_leave_requests(
        self, employee_id=None, status_filter=None, leave_type=None,
        sort_by="applied_at", sort_dir="desc",
        page=1, page_size=100,
    ) -> list[LeaveResponse]:
        leaves = await self.leave_repo.find_all(
            employee_id=employee_id, status_filter=status_filter,
            leave_type=leave_type, sort_by=sort_by, sort_dir=sort_dir,
            page=page, page_size=page_size,
        )
        return [self._to_response(lr) for lr in leaves]

    async def get_leave(self, leave_id: str) -> Optional[LeaveResponse]:
        leave = await self.leave_repo.find_by_id(leave_id)
        if not leave:
            return None
        return self._to_response(leave)

    async def create_leave(self, data: dict, user="anonymous", persona=None) -> LeaveResponse:
        employee_id = data.get("employee_id")

        employee = await self.employee_repo.find_by_id(employee_id) if self.employee_repo else None
        if not employee and self.employee_repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found.",
            )

        start = data.get("start_date")
        end = data.get("end_date")
        # Leave can only be filed in advance or for the current day — never
        # for a date that's already passed. This is what lets the
        # end-of-day attendance sweep be the single source of truth for
        # Leave vs Absent (see AttendanceService.run_end_of_day_sweep): by
        # the time a day's sweep runs, any leave request touching that day
        # has necessarily already been filed and decided, so there's never a
        # stale "Absent" record that needs retroactively fixing up later.
        if start < now_pkt().date():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Leave requests can only be filed for today or a future date.",
            )
        if end and end < start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="End date cannot be before start date.",
            )

        days = self._count_days(start, end)

        # Snapshot balance at submission
        balance_snapshot = None
        if employee and self.leave_policy_repo:
            balance = await self._compute_balance(employee.id)
            balance_snapshot = {
                "casual_remaining": balance.casual_remaining,
                "sick_remaining": balance.sick_remaining,
                "annual_remaining": balance.annual_remaining,
            }

        data["days"] = days
        data["status"] = "Pending"
        data["applied_at"] = now_pkt()
        data["balance_snapshot"] = balance_snapshot
        data.pop("employee", None)

        leave = await self.leave_repo.create(data)

        if self.notification_repo and employee:
            # Only the employee's actual manager needs to know a request is
            # waiting on them — this used to broadcast to every "hr"/"owner"
            # access-level holder, which meant the whole Owner department got
            # pinged for every single leave request regardless of who it was
            # even relevant to. Falls back to "owner" (broadcast) only if
            # this employee has no manager on file, so a request never goes
            # completely unnoticed.
            manager = await self.employee_repo.find_by_exact_name(employee.manager) if employee.manager else None
            await self.notification_repo.create(
                user_id=manager.id if manager else "owner",
                notif_type="Leave Submitted",
                title="Leave request submitted",
                message=f"{employee.name} submitted a {leave.leave_type} leave request.",
                related_type="leave",
                related_id=leave.id,
            )

        await self._audit(user, "Submitted", f"{employee.name if employee else employee_id} — {leave.leave_type}", f"{days} day(s)")

        return self._to_response(leave)

    async def _own_pending_leave(self, leave_id: str, user_id: str):
        """Shared guard for the two self-service actions below. A request is
        only the applicant's to change while nobody has acted on it — once
        it's Approved or Rejected it's a decided record (and an approved one
        the attendance sweep may already have built Leave rows from), so
        editing or withdrawing it has to go through whoever decided it, not
        silently from the applicant's own screen."""
        leave = await self.leave_repo.find_by_id(leave_id)
        if not leave:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found.")
        if leave.employee_id != user_id:
            # Deliberately 404, not 403 — a 403 would confirm that someone
            # else's request with this id exists.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found.")
        if leave.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This request has already been {leave.status.lower()} and can no longer be changed.",
            )
        return leave

    async def update_own_leave(self, leave_id: str, data: dict, user_id: str) -> LeaveResponse:
        leave = await self._own_pending_leave(leave_id, user_id)

        start = data.get("start_date") or leave.start_date
        end = data.get("end_date") if "end_date" in data else leave.end_date
        # Same two rules create_leave enforces — an edit must not be able to
        # sneak past a validation the original submission had to satisfy.
        if start < now_pkt().date():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Leave requests can only be filed for today or a future date.",
            )
        if end and end < start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="End date cannot be before start date.",
            )

        data["start_date"] = start
        data["end_date"] = end
        data["days"] = self._count_days(start, end)
        updated = await self.leave_repo.update(leave, data)
        await self._audit(user_id, "Edited", f"{updated.leave_type}", f"{updated.days} day(s)")
        return self._to_response(updated)

    async def delete_own_leave(self, leave_id: str, user_id: str) -> None:
        leave = await self._own_pending_leave(leave_id, user_id)
        await self._audit(user_id, "Withdrew", f"{leave.leave_type}", f"{leave.days} day(s)")
        await self.leave_repo.delete(leave)

    async def approve_leave(
        self, leave_id: str, note: Optional[str] = None,
        approved_by=None, persona=None,
    ) -> LeaveResponse:
        leave = await self.leave_repo.find_by_id(leave_id)
        if not leave:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found.",
            )

        is_manager = False
        actor_emp = None
        if approved_by and self.employee_repo:
            actor_emp = await self.employee_repo.find_by_id(approved_by)
            leave_emp = leave.employee or (await self.employee_repo.find_by_id(leave.employee_id) if leave.employee_id else None)
            if actor_emp and leave_emp and leave_emp.manager and leave_emp.manager.strip().lower() == actor_emp.name.strip().lower():
                is_manager = True

        if not (has_role(persona, "hr", "owner") or is_manager):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR, Owner, or the employee's manager can approve leave requests.",
            )


        if leave.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending requests can be approved.",
            )

        leave = await self.leave_repo.update(leave, {
            "status": "Approved",
            "approved_by_id": approved_by,
            "approved_at": now_pkt(),
            "approval_note": note,
        })

        if self.notification_repo:
            emp = leave.employee
            by_suffix = f" by {actor_emp.name}" if actor_emp else ""
            # Falls back to "owner" (never "all") on the practically-unreachable
            # case where the leave request's own employee relationship somehow
            # doesn't resolve — a broadcast-to-everyone here would mean a random
            # employee learns about someone else's leave decision.
            await self.notification_repo.create(
                user_id=emp.id if emp else "owner",
                notif_type="Leave Approved",
                title="Leave request approved",
                message=f"Your {leave.leave_type} leave has been approved{by_suffix}."
                         + (f" Note: {note}" if note else ""),
                related_type="leave",
                related_id=leave.id,
            )

        emp = leave.employee
        await self._audit(approved_by, "Approved", f"{emp.name if emp else leave.employee_id} — {leave.leave_type}", note)

        return self._to_response(leave)

    async def reject_leave(
        self, leave_id: str, rejection_reason: Optional[str] = None,
        rejected_by=None, persona=None,
    ) -> LeaveResponse:
        leave = await self.leave_repo.find_by_id(leave_id)
        if not leave:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found.",
            )

        is_manager = False
        actor_emp = None
        if rejected_by and self.employee_repo:
            actor_emp = await self.employee_repo.find_by_id(rejected_by)
            leave_emp = leave.employee or (await self.employee_repo.find_by_id(leave.employee_id) if leave.employee_id else None)
            if actor_emp and leave_emp and leave_emp.manager and leave_emp.manager.strip().lower() == actor_emp.name.strip().lower():
                is_manager = True

        if not (has_role(persona, "hr", "owner") or is_manager):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR, Owner, or the employee's manager can reject leave requests.",
            )


        if leave.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending requests can be rejected.",
            )

        leave = await self.leave_repo.update(leave, {
            "status": "Rejected",
            "rejection_reason": rejection_reason,
            # approved_by_id records who made the decision either way — was
            # never set on reject at all (only approve_leave used to try,
            # and even that silently failed, see the fix above).
            "approved_by_id": rejected_by,
        })

        if self.notification_repo:
            emp = leave.employee
            by_suffix = f" by {actor_emp.name}" if actor_emp else ""
            await self.notification_repo.create(
                user_id=emp.id if emp else "owner",
                notif_type="Leave Rejected",
                title="Leave request rejected",
                message=f"Your {leave.leave_type} leave has been rejected{by_suffix}."
                         + (f" Reason: {rejection_reason}" if rejection_reason else ""),
                related_type="leave",
                related_id=leave.id,
            )

        emp = leave.employee
        await self._audit(rejected_by, "Rejected", f"{emp.name if emp else leave.employee_id} — {leave.leave_type}", rejection_reason)

        return self._to_response(leave)

    async def get_balance(self, employee_id: str) -> LeaveBalanceResponse:
        return await self._compute_balance(employee_id)

    async def _compute_balance(self, employee_id: str) -> LeaveBalanceResponse:
        policy = await self.leave_policy_repo.get_current() if self.leave_policy_repo else None
        casual_total = policy.casual_days if policy else 12
        sick_total = policy.sick_days if policy else 7
        annual_total = policy.annual_days if policy else 14

        # Balances are an annual allotment — only leave taken/pending *this*
        # calendar year (PKT) should count against it, otherwise a used day
        # from a prior year would permanently eat into every future year's
        # balance.
        current_year = now_pkt().year

        casual_used = 0
        sick_used = 0
        annual_used = 0
        casual_pending = 0
        sick_pending = 0
        annual_pending = 0

        for t in ["Casual", "Sick", "Annual"]:
            approved = await self.leave_repo.find_approved_by_type(employee_id, t, year=current_year)
            pending = await self.leave_repo.find_pending_by_type(employee_id, t, year=current_year)
            used = sum(lr.days for lr in approved)
            pend = sum(lr.days for lr in pending)
            if t == "Casual":
                casual_used = used
                casual_pending = pend
            elif t == "Sick":
                sick_used = used
                sick_pending = pend
            else:
                annual_used = used
                annual_pending = pend

        return LeaveBalanceResponse(
            employee_id=employee_id,
            casual_used=casual_used,
            casual_pending=casual_pending,
            casual_remaining=max(0, casual_total - casual_used - casual_pending),
            sick_used=sick_used,
            sick_pending=sick_pending,
            sick_remaining=max(0, sick_total - sick_used - sick_pending),
            annual_used=annual_used,
            annual_pending=annual_pending,
            annual_remaining=max(0, annual_total - annual_used - annual_pending),
            total_used=casual_used + sick_used + annual_used,
            total_pending=casual_pending + sick_pending + annual_pending,
            total_remaining=max(0, casual_total + sick_total + annual_total - casual_used - sick_used - annual_used - casual_pending - sick_pending - annual_pending),
        )

    def _count_days(self, start: date, end: Optional[date]) -> int:
        if not end:
            return 1
        return (end - start).days + 1

    def _to_response(self, leave: LeaveRequest) -> LeaveResponse:
        resp = LeaveResponse.model_validate(leave)
        if leave.employee:
            resp.employee_name = leave.employee.name
            resp.employee_department = leave.employee.department
        return resp
