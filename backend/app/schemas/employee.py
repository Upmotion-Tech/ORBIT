from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


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
    status: str = Field(default="Active")
    probation_end: Optional[date] = None
    contract_file: bool = False


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
    status: Optional[str] = Field(None)
    probation_end: Optional[date] = None
    contract_file: Optional[bool] = None


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
