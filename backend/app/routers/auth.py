from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, verify_password, get_password_hash
from app.core.time import now_pkt
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.audit_log_repository import AuditLogRepository

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., max_length=255)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=255)
    new_password: str = Field(..., min_length=6, max_length=255)


class LoginUserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department: str
    access_levels: list[str]
    # True whenever the password on file was assigned/reset by HR/Owner and
    # the employee hasn't yet replaced it with one of their own choosing —
    # the frontend gates on this to force a Change Password screen before
    # anything else in the app is reachable.
    must_change_password: bool = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: LoginUserResponse


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = EmployeeRepository(db)
    employee = await repo.find_by_email(body.email.strip().lower())
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No account found with this email.",
        )
    if not verify_password(body.password, employee.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password.",
        )
    # Checked only after the password is confirmed correct — telling an
    # unauthenticated caller "this account is deactivated" before they've
    # proven they know the password would leak account state to anyone
    # probing emails.
    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated by the Owner. Contact Admin.",
        )
    token = create_access_token(data={
        "sub": employee.email,
        "user_id": employee.id,
        "name": employee.name,
        "roles": employee.access_levels,
    })
    return LoginResponse(
        access_token=token,
        user=LoginUserResponse(
            id=employee.id,
            name=employee.name,
            email=employee.email,
            role=employee.role,
            department=employee.department,
            access_levels=employee.access_levels,
            must_change_password=employee.must_change_password,
        ),
    )


@router.get("/me", response_model=LoginUserResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validates the stored token and returns fresh employee data — used by
    the frontend to auto-login on page refresh instead of trusting a
    client-decoded (possibly stale or expired) token."""
    repo = EmployeeRepository(db)
    employee = await repo.find_by_id(current_user.get("user_id", ""))
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account no longer exists.",
        )
    return LoginUserResponse(
        id=employee.id,
        name=employee.name,
        email=employee.email,
        role=employee.role,
        department=employee.department,
        access_levels=employee.access_levels,
        must_change_password=employee.must_change_password,
    )


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Self-service password change. Deliberately gated only by a valid JWT
    (get_current_user) — not by must_change_password being false — since
    this is the exact endpoint an employee forced into the Change Password
    screen has to be able to call before they've ever cleared that flag."""
    repo = EmployeeRepository(db)
    employee = await repo.find_by_id(current_user.get("user_id", ""))
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account no longer exists.",
        )
    if not verify_password(body.current_password, employee.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    if verify_password(body.new_password, employee.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from your current password.",
        )
    await repo.update(employee, {
        "password_hash": get_password_hash(body.new_password),
        "must_change_password": False,
        "updated_by": employee.email,
        "updated_at": now_pkt(),
    })
    await AuditLogRepository(db).log(
        employee.email, "Password Changed", "Employee", employee.name, "Self-service password change",
    )
    return {"success": True, "message": "Password updated successfully."}
