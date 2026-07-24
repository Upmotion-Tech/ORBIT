from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator


class TaxSlabCreate(BaseModel):
    min_salary: float = Field(..., ge=0)
    max_salary: Optional[float] = Field(None, ge=0)
    tax_percentage: float = Field(0.0, ge=0, le=100)
    fixed_tax: float = Field(0.0, ge=0)
    active: bool = True

    @model_validator(mode="after")
    def _check_range(self):
        if self.max_salary is not None and self.max_salary <= self.min_salary:
            raise ValueError("Max salary must be greater than min salary.")
        return self


class TaxSlabUpdate(BaseModel):
    min_salary: Optional[float] = Field(None, ge=0)
    max_salary: Optional[float] = Field(None, ge=0)
    tax_percentage: Optional[float] = Field(None, ge=0, le=100)
    fixed_tax: Optional[float] = Field(None, ge=0)
    active: Optional[bool] = None


class TaxSlabResponse(BaseModel):
    id: str
    min_salary: float
    max_salary: Optional[float] = None
    tax_percentage: float
    fixed_tax: float
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
