from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field

class SalarySlipCreate(BaseModel):
    employee_id: str = Field(..., max_length=36)
    month: str = Field(..., max_length=7) # "YYYY-MM"
    gross_salary: float = Field(0.0, ge=0)
    tax: float = Field(0.0, ge=0)
    other_deductions: float = Field(0.0, ge=0)
    deduction_reason: Optional[str] = None
    bonus: float = Field(0.0, ge=0)
    allowances: float = Field(0.0, ge=0)
    notes: Optional[str] = None

class SalarySlipUpdate(BaseModel):
    gross_salary: Optional[float] = None
    tax: Optional[float] = None
    other_deductions: Optional[float] = None
    deduction_reason: Optional[str] = None
    bonus: Optional[float] = None
    allowances: Optional[float] = None
    payment_status: Optional[str] = None
    payment_date: Optional[date] = None
    notes: Optional[str] = None

class SalarySlipResponse(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_role: Optional[str] = None
    employee_department: Optional[str] = None
    month: str
    gross_salary: float
    tax: float
    other_deductions: float
    deduction_reason: Optional[str] = None
    bonus: float
    allowances: float
    net_salary: float
    payment_status: str
    payment_date: Optional[date] = None
    notes: Optional[str] = None
    tax_is_manual: bool = False
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"from_attributes": True}
