from datetime import datetime
from pydantic import BaseModel, Field, field_validator

from app.core.time import to_pkt


class CurrencySettingsResponse(BaseModel):
    base_currency: str
    usd_to_pkr_rate: float
    updated_at: datetime | None = None
    updated_by: str | None = None

    model_config = {"from_attributes": True}

    @field_validator("updated_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v


class CurrencySettingsUpdate(BaseModel):
    usd_to_pkr_rate: float = Field(..., gt=0)
