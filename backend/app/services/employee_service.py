from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status

from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.models.employee import Employee
from app.core.security import get_password_hash, verify_password, generate_temp_password
from app.core.time import now_pkt
from app.core.permissions import has_role
from app.services.email_service import EmailService

PROBATION_MONTHS = 3


class EmployeeService:
    def __init__(
        self,
        employee_repo: EmployeeRepository,
        notification_repo: Optional[NotificationRepository] = None,
        audit_repo = None,
        email_service: Optional[EmailService] = None,
    ):
        self.employee_repo = employee_repo
        self.notification_repo = notification_repo
        self.audit_repo = audit_repo
        self.email_service = email_service

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Employee", label, detail)

    async def list_employees(
        self, search=None, department=None, status_filter=None,
        sort_by="created_at", sort_dir="desc",
        page=1, page_size=100, persona=None,
    ) -> list[EmployeeResponse]:
        employees = await self.employee_repo.find_all(
            search=search, department=department, status_filter=status_filter,
            sort_by=sort_by, sort_dir=sort_dir,
            page=page, page_size=page_size,
        )
        return [self._to_response(e, persona) for e in employees]

    async def get_employee(self, employee_id: str, persona=None) -> Optional[EmployeeResponse]:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            return None
        return self._to_response(employee, persona)

    async def create_employee(
        self, data: dict, user="anonymous", persona=None,
    ) -> EmployeeResponse:
        if not has_role(persona, "owner", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner or Finance can add employees.",
            )

        email = data.get("email", "").strip().lower()
        existing = await self.employee_repo.find_by_email(email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An employee with this email already exists.",
            )

        # Password is never client-supplied — always a fresh random temp
        # password, mailed to the employee (never returned to the caller
        # unless the mail itself failed to send, see below).
        data.pop("password", None)
        temp_password = generate_temp_password()
        password_hash = get_password_hash(temp_password)

        data["email"] = email
        data["password_hash"] = password_hash
        data["created_by"] = user
        data["updated_by"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()
        # Probation is always 3 months from the start date — never a
        # manually-entered value, even if one was sent in the payload.
        if data.get("start_date"):
            data["probation_end"] = data["start_date"] + relativedelta(months=PROBATION_MONTHS)

        employee = await self.employee_repo.create(data)

        email_sent = False
        if self.email_service:
            email_sent = await self.email_service.send_welcome_email(
                to_email=employee.email, to_name=employee.name, temp_password=temp_password,
            )

        if self.notification_repo:
            # HR/Owner-relevant only — broadcasting to "all" meant every
            # employee got notified whenever anyone (else) was hired.
            for target in ("hr", "owner"):
                await self.notification_repo.create(
                    user_id=target,
                    notif_type="Employee Added",
                    title="New employee added",
                    message=f"{employee.name} has been added as {employee.role}.",
                )

        await self._audit(user, "Created", employee.name, f"Role '{employee.role}'")

        resp = self._to_response(employee, persona)
        resp.welcome_email_sent = email_sent
        if not email_sent:
            # Fallback so the account isn't unreachable — the caller (HR/
            # Owner) needs some way to hand over the credential if the mail
            # never arrived.
            resp.temp_password = temp_password
        return resp

    async def update_employee(
        self, employee_id: str, data: dict, user="anonymous", persona=None, actor_id=None,
    ) -> EmployeeResponse:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found.",
            )

        if not has_role(persona, "owner", "hr", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner, HR, or Finance can update employees.",
            )

        if "email" in data:
            email = data["email"].strip().lower()
            existing = await self.employee_repo.find_by_email(email)
            if existing and existing.id != employee_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An employee with this email already exists.",
                )
            data["email"] = email

        password_changed = False
        if "password" in data:
            pw = data.pop("password")
            if pw:
                if verify_password(pw, employee.password_hash):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="New password matches the current password.",
                    )
                data["password_hash"] = get_password_hash(pw)
                # Only force a mandatory re-change when someone ELSE assigned
                # this password (HR/Owner resetting another employee's
                # account) — that's "assigned on the employee's behalf, not
                # their own choice", the actual condition must_change_password
                # is meant to capture. When the acting user IS this employee
                # (changing their own password from their own profile), they
                # already chose it themselves, so there's nothing to force —
                # this used to unconditionally set True regardless of who
                # was acting, which meant self-changing your own password
                # from your profile re-flagged your account every time,
                # producing an infinite "must change password" loop on every
                # subsequent login/refresh even though you'd just done so.
                is_self = bool(actor_id) and actor_id == employee.id
                data["must_change_password"] = not is_self
                password_changed = True

        data["updated_by"] = user
        data["updated_at"] = now_pkt()
        # Keep probation_end in lockstep with start_date — recompute
        # whenever start_date changes, rather than let it drift or be set
        # independently by a client-supplied value.
        if data.get("start_date"):
            data["probation_end"] = data["start_date"] + relativedelta(months=PROBATION_MONTHS)
        else:
            data.pop("probation_end", None)

        employee = await self.employee_repo.update(employee, data)

        if self.notification_repo:
            # HR/Owner-relevant only — was broadcasting to "all", so every
            # employee got notified whenever *anyone else's* record changed
            # (e.g. Ayesha Siddiqui getting "Hamza Farooq's record has been
            # updated"). The employee whose own record changed already finds
            # out by looking at their own profile; this notification exists
            # for HR/Owner to track changes, not for company-wide broadcast.
            for target in ("hr", "owner"):
                await self.notification_repo.create(
                    user_id=target,
                    notif_type="Employee Updated",
                    title="Employee record updated",
                    message=f"{employee.name}'s record has been updated.",
                )

        if password_changed:
            await self._audit(user, "Password Changed", employee.name)
        else:
            await self._audit(user, "Updated", employee.name)

        return self._to_response(employee, persona)

    async def delete_employee(
        self, employee_id: str, persona=None, user="anonymous",
    ) -> None:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found.",
            )

        if not has_role(persona, "hr"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can deactivate employees.",
            )

        await self._audit(user, "Deactivated", employee.name)
        await self.employee_repo.soft_delete(employee)

    async def set_account_active(
        self, employee_id: str, is_active: bool, user="anonymous", actor_id=None, persona=None,
    ) -> EmployeeResponse:
        # Deliberately separate from delete_employee/soft_delete above (which
        # terminates an employee's record entirely) — this is a reversible
        # login-access switch only. Owner-only, per explicit request.
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found.",
            )

        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Owner can activate or deactivate accounts.",
            )

        if not is_active and actor_id and actor_id == employee.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own account.",
            )

        employee = await self.employee_repo.update(employee, {
            "is_active": is_active,
            "updated_by": user,
            "updated_at": now_pkt(),
        })

        await self._audit(
            user,
            "Account Activated" if is_active else "Account Deactivated",
            employee.name,
        )

        return self._to_response(employee, persona)

    async def permanently_delete_employee(
        self, employee_id: str, user="anonymous", actor_id=None, persona=None,
    ) -> str:
        # Genuine hard-delete: removes the account (can never log in again)
        # plus every row that personally belongs to them, per explicit
        # request — distinct from delete_employee/soft_delete above, which
        # only flips an account inactive and keeps the record for history.
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found.",
            )

        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Owner can permanently delete an account.",
            )

        if actor_id and actor_id == employee.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot delete your own account.",
            )

        employee_name = employee.name
        # Capture the name before the row is gone — nothing to log against
        # afterward.
        await self._audit(user, "Account Permanently Deleted", employee_name)
        await self.employee_repo.hard_delete_with_related_data(employee)

        return employee_name

    def _to_response(self, employee: Employee, persona) -> EmployeeResponse:
        resp = EmployeeResponse.model_validate(employee)
        if not has_role(persona, "owner", "hr", "finance"):
            resp.salary = None
        if resp.probation_end:
            resp.probation_status = "In Probation" if now_pkt().date() < resp.probation_end else "Cleared"
        return resp
