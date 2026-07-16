from typing import Optional

from fastapi import HTTPException, status

from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.models.employee import Employee
from app.core.security import get_password_hash, verify_password
from app.core.time import now_pkt
from app.core.permissions import has_role


class EmployeeService:
    def __init__(
        self,
        employee_repo: EmployeeRepository,
        notification_repo: Optional[NotificationRepository] = None,
    ):
        self.employee_repo = employee_repo
        self.notification_repo = notification_repo

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
        if not has_role(persona, "owner", "hr", "hr_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can create employees.",
            )

        email = data.get("email", "").strip().lower()
        existing = await self.employee_repo.find_by_email(email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An employee with this email already exists.",
            )

        password = data.pop("password", "")
        password_hash = get_password_hash(password)

        data["email"] = email
        data["password_hash"] = password_hash
        data["created_by"] = user
        data["updated_by"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()

        employee = await self.employee_repo.create(data)

        if self.notification_repo:
            await self.notification_repo.create(
                user_id="all",
                notif_type="Employee Added",
                title="New employee added",
                message=f"{employee.name} has been added as {employee.role}.",
            )

        return self._to_response(employee, persona)

    async def update_employee(
        self, employee_id: str, data: dict, user="anonymous", persona=None,
    ) -> EmployeeResponse:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found.",
            )

        if not has_role(persona, "owner", "hr", "hr_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can update employees.",
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

        if "password" in data:
            pw = data.pop("password")
            if pw:
                if verify_password(pw, employee.password_hash):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="New password matches the current password.",
                    )
                data["password_hash"] = get_password_hash(pw)

        data["updated_by"] = user
        data["updated_at"] = now_pkt()

        employee = await self.employee_repo.update(employee, data)

        if self.notification_repo:
            await self.notification_repo.create(
                user_id="all",
                notif_type="Employee Updated",
                title="Employee record updated",
                message=f"{employee.name}'s record has been updated.",
            )

        return self._to_response(employee, persona)

    async def delete_employee(
        self, employee_id: str, persona=None,
    ) -> None:
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Employee not found.",
            )

        if not has_role(persona, "hr", "hr_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can deactivate employees.",
            )

        await self.employee_repo.soft_delete(employee)

    def _to_response(self, employee: Employee, persona) -> EmployeeResponse:
        resp = EmployeeResponse.model_validate(employee)
        if not has_role(persona, "owner", "hr", "hr_admin", "financehead"):
            resp.salary = None
        return resp
