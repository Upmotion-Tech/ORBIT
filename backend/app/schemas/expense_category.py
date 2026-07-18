from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class ExpenseCategoryResponse(BaseModel):
    id: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
