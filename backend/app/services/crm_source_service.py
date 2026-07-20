from fastapi import HTTPException, status

from app.repositories.crm_source_repository import CrmSourceRepository
from app.schemas.crm_source import CrmSourceResponse
from app.core.permissions import has_role


class CrmSourceService:
    def __init__(self, source_repo: CrmSourceRepository):
        self.source_repo = source_repo

    async def list_sources(self) -> list[CrmSourceResponse]:
        sources = await self.source_repo.find_all()
        return [CrmSourceResponse.model_validate(s) for s in sources]

    async def create_source(self, name: str, persona=None) -> CrmSourceResponse:
        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner can add reporting sources.",
            )
        name = name.strip()
        existing = await self.source_repo.find_by_name(name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This source already exists.",
            )
        source = await self.source_repo.create(name)
        return CrmSourceResponse.model_validate(source)

    async def update_source(self, source_id: str, new_name: str, persona=None) -> CrmSourceResponse:
        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner can rename reporting sources.",
            )
        source = await self.source_repo.find_by_id(source_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reporting source not found.",
            )
        new_name = new_name.strip()
        existing = await self.source_repo.find_by_name(new_name)
        if existing and existing.id != source_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This source name already exists.",
            )
        source.name = new_name
        await self.source_repo.db.flush()
        return CrmSourceResponse.model_validate(source)

    async def delete_source(self, source_id: str, persona=None) -> None:
        if not has_role(persona, "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner can delete reporting sources.",
            )
        source = await self.source_repo.find_by_id(source_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Reporting source not found.",
            )
        if await self.source_repo.count() <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one reporting source must remain.",
            )
        await self.source_repo.delete(source)
