from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.repositories.lead_repository import LeadRepository
from app.repositories.activity_repository import ActivityRepository
from app.schemas.lead import LeadCreate, LeadUpdate, LeadStageUpdate, LeadResponse, LeadListResponse
from app.schemas.lead_activity import ActivityCreate, ActivityResponse, ActivityListResponse
from app.schemas.common import ErrorResponse, WarningResponse
from app.services.lead_service import LeadService
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/leads", tags=["Leads"])


def get_lead_service(db: AsyncSession = Depends(get_db)) -> LeadService:
    return LeadService(LeadRepository(db), ActivityRepository(db))


@router.get("", response_model=LeadListResponse)
async def list_leads(
    search: Optional[str] = Query(None, description="Search across company, contact, rep, description"),
    stage: Optional[str] = Query(None, description="Filter by stage"),
    source: Optional[str] = Query(None, description="Filter by source"),
    assigned_rep: Optional[str] = Query(None, description="Filter by assigned rep"),
    date_from: Optional[date] = Query(None, description="Date received start (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Date received end (YYYY-MM-DD)"),
    overdue_only: bool = Query(False, description="Only overdue follow-up leads"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_dir: str = Query("desc", description="Sort direction (asc/desc)"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=200, description="Items per page"),
    service: LeadService = Depends(get_lead_service),
):
    return await service.list_leads(
        search=search,
        stage=stage,
        source=source,
        assigned_rep=assigned_rep,
        date_from=date_from,
        date_to=date_to,
        overdue_only=overdue_only,
        sort_by=sort_by,
        sort_dir=sort_dir,
        page=page,
        page_size=page_size,
    )


@router.get("/search", response_model=LeadListResponse)
async def search_leads(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    service: LeadService = Depends(get_lead_service),
):
    return await service.search_leads(query=q, limit=limit)


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: str,
    service: LeadService = Depends(get_lead_service),
):
    lead = await service.get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.post("", response_model=WarningResponse, status_code=201)
async def create_lead(
    data: LeadCreate,
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    lead, warning = await service.create_lead(data.model_dump(), user=current_user.get("sub", "anonymous"))
    return WarningResponse(success=True, warning=warning, data=lead.model_dump())


@router.put("/{lead_id}", response_model=WarningResponse)
async def update_lead(
    lead_id: str,
    data: LeadUpdate,
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    lead, warning, error = await service.update_lead(lead_id, update_data, user=current_user.get("sub", "anonymous"))
    if error:
        raise HTTPException(status_code=404, detail=error)
    return WarningResponse(success=True, warning=warning, data=lead.model_dump() if lead else None)


@router.patch("/{lead_id}/stage", response_model=WarningResponse)
async def change_lead_stage(
    lead_id: str,
    data: LeadStageUpdate,
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    is_owner = current_user.get("role") == "owner"
    lead, error = await service.change_stage(
        lead_id, data.stage,
        user=current_user.get("sub", "anonymous"),
        is_owner=is_owner,
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return WarningResponse(success=True, data=lead.model_dump() if lead else None)


@router.delete("/{lead_id}", status_code=204)
async def delete_lead(
    lead_id: str,
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    deleted = await service.delete_lead(lead_id, user=current_user.get("sub", "anonymous"))
    if not deleted:
        raise HTTPException(status_code=404, detail="Lead not found")
    return None


@router.post("/{lead_id}/scope-document", response_model=WarningResponse)
async def upload_scope_document(
    lead_id: str,
    file: UploadFile = File(...),
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    filename = await storage_service.save(file, prefix="scope_")
    url = storage_service.get_url(filename)
    lead, error = await service.upload_document(lead_id, "scope_document", url, user=current_user.get("sub", "anonymous"))
    if error:
        raise HTTPException(status_code=404, detail=error)
    return WarningResponse(success=True, data=lead.model_dump() if lead else None)


@router.post("/{lead_id}/signed-contract", response_model=WarningResponse)
async def upload_signed_contract(
    lead_id: str,
    file: UploadFile = File(...),
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    filename = await storage_service.save(file, prefix="contract_")
    url = storage_service.get_url(filename)
    lead, error = await service.upload_document(lead_id, "signed_contract", url, user=current_user.get("sub", "anonymous"))
    if error:
        raise HTTPException(status_code=404, detail=error)
    return WarningResponse(success=True, data=lead.model_dump() if lead else None)


@router.delete("/{lead_id}/scope-document", response_model=WarningResponse)
async def remove_scope_document(
    lead_id: str,
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    lead, error = await service.remove_document(lead_id, "scope_document", user=current_user.get("sub", "anonymous"))
    if error:
        raise HTTPException(status_code=404, detail=error)
    return WarningResponse(success=True, data=lead.model_dump() if lead else None)


@router.delete("/{lead_id}/signed-contract", response_model=WarningResponse)
async def remove_signed_contract(
    lead_id: str,
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    lead, error = await service.remove_document(lead_id, "signed_contract", user=current_user.get("sub", "anonymous"))
    if error:
        raise HTTPException(status_code=404, detail=error)
    return WarningResponse(success=True, data=lead.model_dump() if lead else None)


@router.get("/{lead_id}/activities", response_model=ActivityListResponse)
async def list_activities(
    lead_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    service: LeadService = Depends(get_lead_service),
):
    return await service.get_activities(lead_id, page=page, page_size=page_size)


@router.post("/{lead_id}/activities", response_model=WarningResponse, status_code=201)
async def create_activity(
    lead_id: str,
    data: ActivityCreate,
    service: LeadService = Depends(get_lead_service),
    current_user: dict = Depends(get_current_user),
):
    activity, error = await service.create_activity(
        lead_id,
        data.model_dump(),
        user=current_user.get("sub", "anonymous"),
    )
    if error:
        raise HTTPException(status_code=404, detail=error)
    return WarningResponse(success=True, data=activity.model_dump() if activity else None)
