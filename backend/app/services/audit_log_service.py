from app.repositories.audit_log_repository import AuditLogRepository
from app.schemas.audit_log import AuditLogResponse


class AuditLogService:
    def __init__(self, audit_repo: AuditLogRepository):
        self.audit_repo = audit_repo

    async def list_logs(self, limit: int = 200) -> list[AuditLogResponse]:
        logs = await self.audit_repo.find_all(limit=limit)
        return [AuditLogResponse.model_validate(l) for l in logs]
