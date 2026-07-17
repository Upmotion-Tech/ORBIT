from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

class InvoiceLineItem(BaseModel):
    project_id: Optional[str] = None
    description: str = Field(..., min_length=1, max_length=255)
    qty: float = Field(1, gt=0)
    unit_price: float = Field(0, ge=0)

class InvoiceCreate(BaseModel):
    invoice_number: str = Field(..., min_length=1, max_length=100)
    client: str = Field(..., max_length=255)
    project_id: Optional[str] = Field(None, max_length=36)
    currency: str = Field("USD", max_length=10)
    invoice_type: str = Field(..., max_length=100)
    issue_date: date
    due_date: date
    status: str = Field("Draft", max_length=50)
    paid_date: Optional[date] = None
    notes: Optional[str] = None
    line_items: list[InvoiceLineItem] = Field(default_factory=list)
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_name: Optional[str] = None

    @field_validator("line_items")
    @classmethod
    def _validate_line_items(cls, v):
        if not v:
            raise ValueError("At least one line item is required.")
        return v

class InvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = Field(None, min_length=1, max_length=100)
    client: Optional[str] = None
    project_id: Optional[str] = None
    currency: Optional[str] = None
    invoice_type: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    paid_date: Optional[date] = None
    notes: Optional[str] = None
    line_items: Optional[list[InvoiceLineItem]] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_name: Optional[str] = None

    @field_validator("line_items")
    @classmethod
    def _validate_line_items(cls, v):
        if v is not None and not v:
            raise ValueError("At least one line item is required.")
        return v

class InvoiceResponse(BaseModel):
    id: str
    invoice_number: str
    client: str
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    currency: str
    amount: float
    line_items: list[InvoiceLineItem] = Field(default_factory=list)
    invoice_type: str
    issue_date: date
    due_date: date
    status: str
    paid_date: Optional[date] = None
    notes: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_iban: Optional[str] = None
    bank_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"from_attributes": True}
