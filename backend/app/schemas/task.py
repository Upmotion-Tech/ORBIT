from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class TaskCreate(BaseModel):
    project_id: str = Field(..., max_length=36)
    title: str = Field(..., min_length=1, max_length=255)
    assignee: Optional[str] = Field(None, max_length=255)
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str = Field(default="Not Started", pattern=r"^(Not Started|In Progress|Delayed|Completed)$")
    description: Optional[str] = None


class TaskUpdate(BaseModel):
    project_id: Optional[str] = Field(None, max_length=36)
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    assignee: Optional[str] = Field(None, max_length=255)
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: Optional[str] = Field(None, pattern=r"^(Not Started|In Progress|Delayed|Completed)$")
    description: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    project_id: str
    title: str
    assignee: Optional[str] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
