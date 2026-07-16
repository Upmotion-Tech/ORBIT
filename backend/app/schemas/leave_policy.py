from typing import Optional

from pydantic import BaseModel, Field


class LeavePolicyUpdate(BaseModel):
    casual_days: int = Field(default=12, ge=0)
    sick_days: int = Field(default=7, ge=0)
    annual_days: int = Field(default=14, ge=0)


class LeavePolicyResponse(BaseModel):
    casual_days: int
    sick_days: int
    annual_days: int
    year: int

    model_config = {"from_attributes": True}
