from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.time import to_pkt


class LeadCreate(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    client_contact_name: str = Field(..., min_length=1, max_length=255)
    # If set, links to that existing Customer directly (the "select from
    # previous customers" dropdown option) — skips the auto-match/auto-create
    # step in lead_service.create_lead entirely. If omitted, that step runs:
    # match an existing customer by company_name, or auto-create one.
    customer_id: Optional[str] = Field(None, max_length=36)
    assigned_rep: Optional[str] = Field(None, max_length=255)
    source: Optional[str] = Field(None, max_length=100)
    medium: Optional[str] = Field(None, max_length=100)
    value: float = Field(default=0.0, ge=0)
    # No longer a fixed enum pattern — Setup > Stages & Sources lets Owners
    # rename/add/delete pipeline stages, so the set of valid names is
    # dynamic (frontend-managed), not a fixed backend list. A plain
    # length-bounded string accepts whatever the current stage list contains.
    stage: str = Field(default="New", min_length=1, max_length=100)
    description: Optional[str] = None

    date_received: Optional[date] = None
    expected_closure_date: Optional[date] = None
    actual_closure_date: Optional[date] = None
    follow_up_date: Optional[date] = None

    @model_validator(mode="after")
    def validate_dates(self):
        if (self.expected_closure_date and self.date_received and
                self.expected_closure_date < self.date_received):
            raise ValueError("expected_closure_date must be on or after date_received")
        return self


class LeadUpdate(BaseModel):
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    client_contact_name: Optional[str] = Field(None, min_length=1, max_length=255)
    customer_id: Optional[str] = Field(None, max_length=36)
    assigned_rep: Optional[str] = Field(None, max_length=255)
    source: Optional[str] = Field(None, max_length=100)
    medium: Optional[str] = Field(None, max_length=100)
    value: Optional[float] = Field(None, ge=0)
    description: Optional[str] = None

    date_received: Optional[date] = None
    expected_closure_date: Optional[date] = None
    actual_closure_date: Optional[date] = None
    follow_up_date: Optional[date] = None


class LeadStageUpdate(BaseModel):
    # Same reasoning as LeadCreate.stage above — dynamic, not a fixed enum.
    stage: str = Field(..., min_length=1, max_length=100)


class LeadResponse(BaseModel):
    id: str
    company_name: str
    client_contact_name: str
    customer_id: Optional[str] = None
    assigned_rep: Optional[str] = None
    source: Optional[str] = None
    medium: Optional[str] = None
    value: Optional[float] = None
    stage: str
    description: Optional[str] = None

    date_received: Optional[date] = None
    expected_closure_date: Optional[date] = None
    actual_closure_date: Optional[date] = None
    follow_up_date: Optional[date] = None

    scope_document_url: Optional[str] = None
    signed_contract_url: Optional[str] = None
    scope_document_filename: Optional[str] = None
    signed_contract_filename: Optional[str] = None
    is_locked_revenue: bool = False

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    is_overdue_follow_up: bool = False

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v


class LeadListResponse(BaseModel):
    items: list[LeadResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
