from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

from app.core.time import to_pkt


class AuditLogResponse(BaseModel):
    id: str
    actor: str
    action: str
    entity_type: str
    entity_label: str
    detail: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_to_pkt(cls, v):
        return to_pkt(v) if isinstance(v, datetime) else v
