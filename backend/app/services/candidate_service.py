from typing import Optional

from fastapi import HTTPException, status

from app.repositories.candidate_repository import CandidateRepository
from app.schemas.candidate import CandidateCreate, CandidateUpdate, CandidateResponse
from app.models.hiring_candidate import HiringCandidate
from app.core.permissions import has_role


class CandidateService:
    def __init__(
        self,
        candidate_repo: CandidateRepository,
    ):
        self.candidate_repo = candidate_repo

    async def list_candidates(self, opening_id: str, persona=None) -> list[CandidateResponse]:
        if not has_role(persona, "owner", "hr"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied.",
            )
        candidates = await self.candidate_repo.find_by_opening_id(opening_id)
        return [CandidateResponse.model_validate(c) for c in candidates]

    async def create_candidate(
        self, opening_id: str, data: dict, persona=None,
    ) -> CandidateResponse:
        if not has_role(persona, "hr"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can add candidates.",
            )

        data["opening_id"] = opening_id
        candidate = await self.candidate_repo.create(data)
        return CandidateResponse.model_validate(candidate)

    async def update_candidate(
        self, candidate_id: str, data: dict, persona=None,
    ) -> CandidateResponse:
        if not has_role(persona, "hr"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can update candidates.",
            )

        candidate = await self.candidate_repo.find_by_id(candidate_id)
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found.",
            )

        candidate = await self.candidate_repo.update(candidate, data)
        return CandidateResponse.model_validate(candidate)
