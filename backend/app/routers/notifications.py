from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
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
    current_user: dict = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
):
    # Real identity from the token — not a UI persona — so an employee sees
    # their own notifications (leave approved/rejected, etc.) as well as any
    # broadcast to their role (e.g. "hr" sees leave-submitted alerts).
    return await service.get_notifications(
        current_user.get("user_id", ""), current_user.get("roles"),
    )


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
    current_user: dict = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
):
    await service.mark_all_read(current_user.get("user_id", ""), current_user.get("roles"))
    return {"success": True, "message": "All notifications marked as read."}
