from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class HolidayCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    date: date
    end_date: Optional[date] = None

    @model_validator(mode="after")
    def _validate_range(self):
        if self.end_date is not None and self.end_date < self.date:
            raise ValueError("End date can't be before start date.")
        return self


class HolidayResponse(BaseModel):
    id: str
    name: str
    date: date
    end_date: Optional[date] = None
    # Computed by HolidayService, not a DB column — inclusive day count of
    # the [date, end_date or date] range.
    day_count: int

    model_config = {"from_attributes": True}
