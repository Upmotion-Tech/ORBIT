from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, verify_password
from app.repositories.employee_repository import EmployeeRepository

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=255)
    password: str = Field(..., max_length=255)


class LoginUserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    department: str
    access_levels: list[str]


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
            detail="Invalid email or password.",
        )
    if not verify_password(body.password, employee.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
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
    )
