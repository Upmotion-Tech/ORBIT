import re
from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


# Each value (besides "owner" and "employee") corresponds 1:1 to a sidebar
# screen/module — "owner" grants everything, "employee" means no extra
# module access beyond the base Me/Leave/Policies screens every employee
# gets. An employee can hold any combination of these (multi-select), and
# ends up seeing exactly the union of the screens they're ticked for.
ACCESS_LEVELS = ("owner", "dashboard", "crm", "dev", "finance", "hr", "permissions", "customers", "employee")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# +92 followed by exactly 10 digits (Pakistani mobile format) — the frontend
# locks the "+92" prefix in the input itself, this is the server-side
# authoritative check in case that's ever bypassed.
PHONE_REGEX = re.compile(r"^\+92\d{10}$")
# 5 digits - 7 digits - 1 digit (e.g. 35201-5746852-5) — the frontend enters
# this via an auto-dashing input mask, this is the server-side authoritative
# check in case that's ever bypassed.
CNIC_REGEX = re.compile(r"^\d{5}-\d{7}-\d$")


def _validate_phone(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    if not PHONE_REGEX.match(v):
        raise ValueError("Enter a valid number: +92 followed by 10 digits.")
    return v


def _validate_cnic(v: Optional[str]) -> Optional[str]:
    if v is None or v == "":
        return None
    if not CNIC_REGEX.match(v):
        raise ValueError("Enter a valid CNIC: 5 digits, a dash, 7 digits, a dash, 1 digit (e.g. 35201-5746852-5).")
    return v


class EmployeeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(..., min_length=1, max_length=255)
    department: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., max_length=255)
    manager: Optional[str] = Field(None, max_length=255)
    employment_type: str = Field(default="Full-time")
    start_date: date
    salary: float = Field(default=0.0, ge=0)
    # Was missing entirely — the frontend's New Employee form has always
    # required and sent a Password field, but since this schema never
    # declared it, Pydantic silently dropped it from every request before it
    # reached the service layer, which then always fell back to generating
    # its own random password regardless of what was actually typed.
    password: str = Field(..., min_length=1, max_length=255)
    access_levels: list[str] = Field(default_factory=lambda: ["employee"])
    status: str = Field(default="Active")
    probation_end: Optional[date] = None
    birthdate: Optional[date] = None
    phone: Optional[str] = Field(None, max_length=20)
    emergency_contact: Optional[str] = Field(None, max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=100)
    cnic: Optional[str] = Field(None, max_length=15)

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

    @field_validator("phone", "emergency_contact")
    @classmethod
    def _validate_phone_fields(cls, v: Optional[str]) -> Optional[str]:
        return _validate_phone(v)

    @field_validator("cnic")
    @classmethod
    def _validate_cnic_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_cnic(v)


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
    birthdate: Optional[date] = None
    phone: Optional[str] = Field(None, max_length=20)
    emergency_contact: Optional[str] = Field(None, max_length=20)
    emergency_contact_relation: Optional[str] = Field(None, max_length=100)
    cnic: Optional[str] = Field(None, max_length=15)

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

    @field_validator("phone", "emergency_contact")
    @classmethod
    def _validate_phone_fields(cls, v: Optional[str]) -> Optional[str]:
        return _validate_phone(v)

    @field_validator("cnic")
    @classmethod
    def _validate_cnic_field(cls, v: Optional[str]) -> Optional[str]:
        return _validate_cnic(v)


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
    # "In Probation" / "Cleared" — computed server-side from probation_end
    # vs today (PKT), never trust a client-sent value for this.
    probation_status: Optional[str] = None
    contract_file_url: Optional[str] = None
    contract_file_name: Optional[str] = None
    birthdate: Optional[date] = None
    phone: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    cnic: Optional[str] = None
    must_change_password: bool = True
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Both set only by create_employee's response, never by from_attributes
    # (Employee has no such columns) — welcome_email_sent tells the caller
    # whether the mail actually went out; temp_password is a fallback ONLY
    # populated when it didn't, so HR/Owner isn't left with an unreachable
    # account and no way to hand over the credential.
    welcome_email_sent: Optional[bool] = None
    temp_password: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
