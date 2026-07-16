from pydantic import BaseModel, Field


class CurrencyPreferenceUpdate(BaseModel):
    module: str = Field(..., min_length=1, max_length=50)
    currency: str = Field(..., pattern=r"^(USD|PKR)$")


class CurrencyPreferenceResponse(BaseModel):
    module: str
    currency: str
