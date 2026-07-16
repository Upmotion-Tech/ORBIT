from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_role
from app.repositories.notification_repository import NotificationRepository
from app.repositories.task_repository import TaskRepository
from app.services.notification_service import NotificationService
from app.schemas.notification import NotificationResponse, NotificationReadUpdate

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


def get_notification_service(db: AsyncSession = Depends(get_db)) -> NotificationService:
    return NotificationService(
        NotificationRepository(db),
        TaskRepository(db),
    )


@router.get("/", response_model=list[NotificationResponse])
async def get_notifications(
    persona: str = Depends(get_persona_role),
    service: NotificationService = Depends(get_notification_service),
):
    # Retrieve persona-specific notifications
    return await service.get_notifications(persona)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: str,
    data: NotificationReadUpdate,
    service: NotificationService = Depends(get_notification_service),
):
    notif = await service.mark_read(notification_id, is_read=data.is_read)
    if not notif:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    return notif


@router.post("/read-all")
async def mark_all_read(
    persona: str = Depends(get_persona_role),
    service: NotificationService = Depends(get_notification_service),
):
    await service.mark_all_read(persona)
    return {"success": True, "message": "All notifications marked as read."}
