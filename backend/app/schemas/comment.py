from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class CommentCreate(BaseModel):
    project_id: Optional[str] = Field(None, max_length=36)
    task_id: Optional[str] = Field(None, max_length=36)
    parent_id: Optional[str] = Field(None, max_length=36)
    text: str = Field(..., min_length=1)


class CommentResponse(BaseModel):
    id: str
    project_id: Optional[str] = None
    task_id: Optional[str] = None
    parent_id: Optional[str] = None
    author: str
    text: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
