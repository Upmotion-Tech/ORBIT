from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.time import to_pkt


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    client: str = Field(..., min_length=1, max_length=255)
    lead_id: Optional[str] = Field(None, max_length=36)
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str = Field(default="Not Started", pattern=r"^(Not Started|In Progress|Delayed|Completed)$")
    at_risk: bool = Field(default=False)
    budget: float = Field(default=0.0, ge=0)
    description: Optional[str] = None
    team_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_deadline_on_create(self):
        if self.deadline and self.deadline < date.today():
            raise ValueError("Project deadline cannot be before creation date")
        return self


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    client: Optional[str] = Field(None, min_length=1, max_length=255)
    lead_id: Optional[str] = Field(None, max_length=36)
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: Optional[str] = Field(None, pattern=r"^(Not Started|In Progress|Delayed|Completed)$")
    at_risk: Optional[bool] = None
    budget: Optional[float] = Field(None, ge=0)
    description: Optional[str] = None
    team_ids: Optional[list[str]] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    client: str
    lead_id: Optional[str] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str
    at_risk: bool
    budget: Optional[float] = None  # None if hidden for dev
    description: Optional[str] = None
    team_ids: list[str]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_by_id: Optional[str] = None
    updated_by_id: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", "completed_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
