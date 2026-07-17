from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_audit_user
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.audit_log_service import AuditLogService
from app.schemas.audit_log import AuditLogResponse

router = APIRouter(prefix="/api/audit", tags=["Audit"])


def get_audit_log_service(db: AsyncSession = Depends(get_db)) -> AuditLogService:
    return AuditLogService(AuditLogRepository(db))


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    limit: Optional[int] = 200,
    current_user: dict = Depends(get_audit_user),
    service: AuditLogService = Depends(get_audit_log_service),
):
    return await service.list_logs(limit=limit or 200)
