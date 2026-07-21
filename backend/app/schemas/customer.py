from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class CustomerCreate(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    primary_contact_name: Optional[str] = Field(None, max_length=255)
    primary_contact_email: Optional[str] = Field(None, max_length=255)
    primary_contact_phone: Optional[str] = Field(None, max_length=50)
    industry: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    primary_contact_name: Optional[str] = Field(None, max_length=255)
    primary_contact_email: Optional[str] = Field(None, max_length=255)
    primary_contact_phone: Optional[str] = Field(None, max_length=50)
    industry: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = None
    notes: Optional[str] = None


class CustomerResponse(BaseModel):
    id: str
    company_name: str
    primary_contact_name: Optional[str] = None
    primary_contact_email: Optional[str] = None
    primary_contact_phone: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by_id: Optional[str] = None
    updated_by_id: Optional[str] = None
    # Real count of leads currently linked to this customer — lets the list/
    # drawer show "3 leads" without a separate round trip.
    lead_count: int = 0

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
