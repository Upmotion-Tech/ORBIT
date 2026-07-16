from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field

class ExpenseCreate(BaseModel):
    category: str = Field(..., max_length=255)
    amount: float = Field(..., ge=0)
    currency: str = Field("USD", max_length=10)
    expense_type: str = Field(..., max_length=100)
    department: str = Field(..., max_length=255)
    submitted_by_id: str = Field(..., max_length=36)
    submitted_date: date
    notes: Optional[str] = None
    attachments: Optional[str] = None

class ExpenseUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    expense_type: Optional[str] = None
    department: Optional[str] = None
    submitted_by_id: Optional[str] = None
    submitted_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    attachments: Optional[str] = None

class ExpenseResponse(BaseModel):
    id: str
    category: str
    amount: float
    currency: str
    expense_type: str
    department: str
    submitted_by_id: str
    submitted_by_name: Optional[str] = None
    submitted_date: date
    status: str
    notes: Optional[str] = None
    attachments: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"from_attributes": True}
