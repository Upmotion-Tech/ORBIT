from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field

class MilestoneCreate(BaseModel):
    project_id: str = Field(..., max_length=36)
    name: str = Field(..., max_length=255)
    amount: float = Field(..., ge=0)
    currency: str = Field("USD", max_length=10)
    expected_date: date

class MilestoneUpdate(BaseModel):
    project_id: Optional[str] = None
    name: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    expected_date: Optional[date] = None
    status: Optional[str] = None

class MilestoneResponse(BaseModel):
    id: str
    project_id: str
    project_name: Optional[str] = None
    name: str
    amount: float
    currency: str
    expected_date: date
    status: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"from_attributes": True}
