from datetime import date

from pydantic import BaseModel, Field


class HolidayCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    date: date


class HolidayResponse(BaseModel):
    id: str
    name: str
    date: date

    model_config = {"from_attributes": True}
