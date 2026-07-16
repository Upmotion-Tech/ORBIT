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
    ):
        self.leave_repo = leave_repo
        self.employee_repo = employee_repo
        self.leave_policy_repo = leave_policy_repo
        self.notification_repo = notification_repo

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
            await self.notification_repo.create(
                user_id="hr",
                notif_type="Leave Submitted",
                title="Leave request submitted",
                message=f"{employee.name} submitted a {leave.leave_type} leave request.",
            )

        return self._to_response(leave)

    async def approve_leave(
        self, leave_id: str, note: Optional[str] = None,
        approved_by="HR Admin", persona=None,
    ) -> LeaveResponse:
        leave = await self.leave_repo.find_by_id(leave_id)
        if not leave:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found.",
            )

        if not has_role(persona, "hr", "hr_admin", "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can approve leave requests.",
            )

        if leave.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending requests can be approved.",
            )

        leave.status = "Approved"
        leave.approved_by = approved_by
        leave.approved_at = now_pkt()
        leave.approval_note = note

        leave = await self.leave_repo.update(leave, {
            "status": "Approved",
            "approved_by": approved_by,
            "approved_at": now_pkt(),
            "approval_note": note,
        })

        if self.notification_repo:
            emp = leave.employee
            await self.notification_repo.create(
                user_id=emp.id if emp else "all",
                notif_type="Leave Approved",
                title="Leave request approved",
                message=f"Your {leave.leave_type} leave has been approved."
                         + (f" Note: {note}" if note else ""),
            )

        return self._to_response(leave)

    async def reject_leave(
        self, leave_id: str, rejection_reason: Optional[str] = None,
        rejected_by="HR Admin", persona=None,
    ) -> LeaveResponse:
        leave = await self.leave_repo.find_by_id(leave_id)
        if not leave:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Leave request not found.",
            )

        if not has_role(persona, "hr", "hr_admin", "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can reject leave requests.",
            )

        if leave.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending requests can be rejected.",
            )

        leave.status = "Rejected"
        leave.rejection_reason = rejection_reason

        leave = await self.leave_repo.update(leave, {
            "status": "Rejected",
            "rejection_reason": rejection_reason,
        })

        if self.notification_repo:
            emp = leave.employee
            await self.notification_repo.create(
                user_id=emp.id if emp else "all",
                notif_type="Leave Rejected",
                title="Leave request rejected",
                message=f"Your {leave.leave_type} leave has been rejected."
                         + (f" Reason: {rejection_reason}" if rejection_reason else ""),
            )

        return self._to_response(leave)

    async def get_balance(self, employee_id: str) -> LeaveBalanceResponse:
        return await self._compute_balance(employee_id)

    async def _compute_balance(self, employee_id: str) -> LeaveBalanceResponse:
        policy = await self.leave_policy_repo.get_current() if self.leave_policy_repo else None
        casual_total = policy.casual_days if policy else 12
        sick_total = policy.sick_days if policy else 7
        annual_total = policy.annual_days if policy else 14

        casual_used = 0
        sick_used = 0
        annual_used = 0
        casual_pending = 0
        sick_pending = 0
        annual_pending = 0

        for t in ["Casual", "Sick", "Annual"]:
            approved = await self.leave_repo.find_approved_by_type(employee_id, t)
            pending = await self.leave_repo.find_pending_by_type(employee_id, t)
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
