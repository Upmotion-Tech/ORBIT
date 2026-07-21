from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


def _clean_tags(v: Optional[list[str]]) -> list[str]:
    if not v:
        return []
    seen = []
    for t in v:
        t = t.strip().lstrip("#")
        if t and t not in seen:
            seen.append(t)
    return seen


class TaskCreate(BaseModel):
    project_id: str = Field(..., max_length=36)
    title: str = Field(..., min_length=1, max_length=255)
    assignee_id: Optional[str] = Field(None, max_length=36)
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str = Field(default="Not Started", pattern=r"^(Not Started|In Progress|Delayed|Completed)$")
    description: Optional[str] = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, v):
        return _clean_tags(v)


class TaskUpdate(BaseModel):
    project_id: Optional[str] = Field(None, max_length=36)
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    assignee_id: Optional[str] = Field(None, max_length=36)
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: Optional[str] = Field(None, pattern=r"^(Not Started|In Progress|Delayed|Completed)$")
    description: Optional[str] = None
    tags: Optional[list[str]] = None

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, v):
        return _clean_tags(v) if v is not None else v


class TaskResponse(BaseModel):
    id: str
    project_id: str
    title: str
    assignee_id: Optional[str] = None
    start_date: Optional[date] = None
    deadline: Optional[date] = None
    status: str
    description: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by_id: Optional[str] = None
    updated_by_id: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
