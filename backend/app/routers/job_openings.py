from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_persona_role, get_current_user
from app.repositories.job_opening_repository import JobOpeningRepository
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.notification_repository import NotificationRepository
from app.services.job_opening_service import JobOpeningService
from app.services.candidate_service import CandidateService
from app.schemas.job_opening import OpeningCreate, OpeningUpdate, OpeningResponse
from app.schemas.candidate import CandidateCreate, CandidateUpdate, CandidateResponse

router = APIRouter(prefix="/api/job-openings", tags=["Job Openings"])


def get_opening_service(db: AsyncSession = Depends(get_db)) -> JobOpeningService:
    return JobOpeningService(
        opening_repo=JobOpeningRepository(db),
        candidate_repo=CandidateRepository(db),
        notification_repo=NotificationRepository(db),
    )


def get_candidate_service(db: AsyncSession = Depends(get_db)) -> CandidateService:
    return CandidateService(
        candidate_repo=CandidateRepository(db),
    )


@router.get("/", response_model=list[OpeningResponse])
async def list_openings(
    department: Optional[str] = None,
    status_filter: Optional[str] = None,
    sort_by: str = "opened_at",
    sort_dir: str = "desc",
    persona: str = Depends(get_persona_role),
    service: JobOpeningService = Depends(get_opening_service),
):
    return await service.list_openings(
        department=department, status_filter=status_filter,
        sort_by=sort_by, sort_dir=sort_dir, persona=persona,
    )


@router.get("/{opening_id}", response_model=OpeningResponse)
async def get_opening(
    opening_id: str,
    persona: str = Depends(get_persona_role),
    service: JobOpeningService = Depends(get_opening_service),
):
    opening = await service.get_opening(opening_id)
    if not opening:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job opening not found.",
        )
    return opening


@router.post("/", response_model=OpeningResponse, status_code=status.HTTP_201_CREATED)
async def create_opening(
    body: OpeningCreate,
    current_user: dict = Depends(get_current_user),
    persona: str = Depends(get_persona_role),
    service: JobOpeningService = Depends(get_opening_service),
):
    return await service.create_opening(
        body.model_dump(),
        user=current_user.get("sub", "anonymous"),
        persona=persona,
    )


@router.put("/{opening_id}", response_model=OpeningResponse)
async def update_opening(
    opening_id: str,
    body: OpeningUpdate,
    current_user: dict = Depends(get_current_user),
    persona: str = Depends(get_persona_role),
    service: JobOpeningService = Depends(get_opening_service),
):
    return await service.update_opening(
        opening_id,
        body.model_dump(exclude_none=True),
        user=current_user.get("sub", "anonymous"),
        persona=persona,
    )


@router.delete("/{opening_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_opening(
    opening_id: str,
    persona: str = Depends(get_persona_role),
    service: JobOpeningService = Depends(get_opening_service),
):
    await service.delete_opening(opening_id, persona=persona)


# --- Candidates sub-resource ---

@router.get("/{opening_id}/candidates", response_model=list[CandidateResponse])
async def list_candidates(
    opening_id: str,
    persona: str = Depends(get_persona_role),
    service: CandidateService = Depends(get_candidate_service),
):
    return await service.list_candidates(opening_id, persona=persona)


@router.post("/{opening_id}/candidates", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
async def add_candidate(
    opening_id: str,
    body: CandidateCreate,
    persona: str = Depends(get_persona_role),
    service: CandidateService = Depends(get_candidate_service),
):
    return await service.create_candidate(
        opening_id, body.model_dump(), persona=persona,
    )


@router.put("/candidates/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: str,
    body: CandidateUpdate,
    persona: str = Depends(get_persona_role),
    service: CandidateService = Depends(get_candidate_service),
):
    return await service.update_candidate(
        candidate_id, body.model_dump(exclude_none=True), persona=persona,
    )
