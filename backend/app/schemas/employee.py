import re
from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


ACCESS_LEVELS = ("owner", "hr_admin", "financehead", "devmember", "employee")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EmployeeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(..., min_length=1, max_length=255)
    department: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., max_length=255)
    manager: Optional[str] = Field(None, max_length=255)
    employment_type: str = Field(default="Full-time")
    start_date: date
    salary: float = Field(default=0.0, ge=0)
    password: str = Field(..., min_length=1, max_length=255)
    access_levels: list[str] = Field(default_factory=lambda: ["employee"])
    status: str = Field(default="Active")
    probation_end: Optional[date] = None
    contract_file: bool = False

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: str) -> str:
        if not EMAIL_REGEX.match(v):
            raise ValueError("Enter a valid email address.")
        return v

    @field_validator("access_levels")
    @classmethod
    def _validate_access_levels(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one access level is required.")
        invalid = [level for level in v if level not in ACCESS_LEVELS]
        if invalid:
            raise ValueError(f"Invalid access level(s): {', '.join(invalid)}.")
        return v


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    role: Optional[str] = Field(None, min_length=1, max_length=255)
    department: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    manager: Optional[str] = Field(None, max_length=255)
    employment_type: Optional[str] = Field(None)
    start_date: Optional[date] = None
    salary: Optional[float] = Field(None, ge=0)
    password: Optional[str] = Field(None, max_length=255)
    access_levels: Optional[list[str]] = Field(None)
    status: Optional[str] = Field(None)
    probation_end: Optional[date] = None
    contract_file: Optional[bool] = None

    @field_validator("email")
    @classmethod
    def _validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not EMAIL_REGEX.match(v):
            raise ValueError("Enter a valid email address.")
        return v

    @field_validator("access_levels")
    @classmethod
    def _validate_access_levels(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        if not v:
            raise ValueError("At least one access level is required.")
        invalid = [level for level in v if level not in ACCESS_LEVELS]
        if invalid:
            raise ValueError(f"Invalid access level(s): {', '.join(invalid)}.")
        return v


class EmployeeResponse(BaseModel):
    id: str
    name: str
    role: str
    department: str
    email: str
    manager: Optional[str] = None
    employment_type: str
    start_date: Optional[date] = None
    salary: Optional[float] = None
    access_levels: list[str]
    status: str
    probation_end: Optional[date] = None
    contract_file: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
