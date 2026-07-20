from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_roles
from app.repositories.crm_source_repository import CrmSourceRepository
from app.services.crm_source_service import CrmSourceService
from app.schemas.crm_source import CrmSourceCreate, CrmSourceUpdate, CrmSourceResponse

router = APIRouter(prefix="/api/settings/crm/sources", tags=["CRM Sources"])


def get_source_service(db: AsyncSession = Depends(get_db)) -> CrmSourceService:
    return CrmSourceService(source_repo=CrmSourceRepository(db))


@router.get("", response_model=list[CrmSourceResponse])
async def list_crm_sources(
    service: CrmSourceService = Depends(get_source_service),
):
    return await service.list_sources()


@router.post("", response_model=CrmSourceResponse, status_code=status.HTTP_201_CREATED)
async def create_crm_source(
    body: CrmSourceCreate,
    persona: list = Depends(get_persona_roles),
    service: CrmSourceService = Depends(get_source_service),
):
    return await service.create_source(body.name, persona=persona)


@router.put("/{source_id}", response_model=CrmSourceResponse)
async def update_crm_source(
    source_id: str,
    body: CrmSourceUpdate,
    persona: list = Depends(get_persona_roles),
    service: CrmSourceService = Depends(get_source_service),
):
    return await service.update_source(source_id, body.name, persona=persona)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_crm_source(
    source_id: str,
    persona: list = Depends(get_persona_roles),
    service: CrmSourceService = Depends(get_source_service),
):
    await service.delete_source(source_id, persona=persona)
