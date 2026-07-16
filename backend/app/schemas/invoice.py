from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field

class InvoiceCreate(BaseModel):
    client: str = Field(..., max_length=255)
    project_id: str = Field(..., max_length=36)
    currency: str = Field("USD", max_length=10)
    amount: float = Field(..., ge=0)
    invoice_type: str = Field(..., max_length=100)
    issue_date: date
    due_date: date
    notes: Optional[str] = None

class InvoiceUpdate(BaseModel):
    client: Optional[str] = None
    project_id: Optional[str] = None
    currency: Optional[str] = None
    amount: Optional[float] = None
    invoice_type: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class InvoiceResponse(BaseModel):
    id: str
    client: str
    project_id: str
    project_name: Optional[str] = None
    currency: str
    amount: float
    invoice_type: str
    issue_date: date
    due_date: date
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"from_attributes": True}
