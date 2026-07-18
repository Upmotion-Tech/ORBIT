from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_finance_user
from app.repositories.milestone_repository import MilestoneRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.milestone_service import MilestoneService
from app.schemas.milestone import MilestoneCreate, MilestoneUpdate, MilestoneResponse

router = APIRouter(prefix="/api/finance/milestones", tags=["Milestones"])

def get_milestone_service(db: AsyncSession = Depends(get_db)) -> MilestoneService:
    return MilestoneService(
        milestone_repo=MilestoneRepository(db),
        notification_repo=NotificationRepository(db),
        audit_repo=AuditLogRepository(db),
    )

def _map_milestone_response(milestone) -> MilestoneResponse:
    resp = MilestoneResponse.model_validate(milestone)
    resp.project_name = milestone.project.name if milestone.project else None
    return resp

@router.get("", response_model=list[MilestoneResponse])
async def list_milestones(
    search: Optional[str] = None,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 100,
    service: MilestoneService = Depends(get_milestone_service),
    current_user: dict = Depends(get_current_user),
):
    milestones = await service.list_milestones(
        search=search, status=status, project_id=project_id,
        date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir, page=page, page_size=page_size
    )
    return [_map_milestone_response(m) for m in milestones]

@router.get("/{milestone_id}", response_model=MilestoneResponse)
async def get_milestone(
    milestone_id: str,
    service: MilestoneService = Depends(get_milestone_service),
    current_user: dict = Depends(get_current_user),
):
    milestone = await service.get_milestone(milestone_id)
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")
    return _map_milestone_response(milestone)

@router.post("", response_model=MilestoneResponse, status_code=status.HTTP_201_CREATED)
async def create_milestone(
    body: MilestoneCreate,
    service: MilestoneService = Depends(get_milestone_service),
    current_user: dict = Depends(get_finance_user),
):
    milestone = await service.create_milestone(body.model_dump(), user=current_user.get("sub", "anonymous"))
    return _map_milestone_response(milestone)

@router.put("/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(
    milestone_id: str,
    body: MilestoneUpdate,
    service: MilestoneService = Depends(get_milestone_service),
    current_user: dict = Depends(get_finance_user),
):
    milestone = await service.update_milestone(
        milestone_id,
        body.model_dump(exclude_none=True),
        user=current_user.get("sub", "anonymous")
    )
    return _map_milestone_response(milestone)

@router.delete("/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(
    milestone_id: str,
    service: MilestoneService = Depends(get_milestone_service),
    current_user: dict = Depends(get_finance_user),
):
    await service.delete_milestone(milestone_id, user=current_user.get("sub", "anonymous"))
