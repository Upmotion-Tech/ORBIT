from typing import Optional

from fastapi import HTTPException, status

from app.repositories.job_opening_repository import JobOpeningRepository
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.job_opening import OpeningCreate, OpeningUpdate, OpeningResponse
from app.models.job_opening import JobOpening
from app.core.time import now_pkt
from app.core.permissions import has_role


class JobOpeningService:
    def __init__(
        self,
        opening_repo: JobOpeningRepository,
        candidate_repo: Optional[CandidateRepository] = None,
        notification_repo: Optional[NotificationRepository] = None,
    ):
        self.opening_repo = opening_repo
        self.candidate_repo = candidate_repo
        self.notification_repo = notification_repo

    async def list_openings(
        self, department=None, status_filter=None,
        sort_by="opened_at", sort_dir="desc",
        persona=None,
    ) -> list[OpeningResponse]:
        openings = await self.opening_repo.find_all(
            department=department, status_filter=status_filter,
            sort_by=sort_by, sort_dir=sort_dir,
        )
        return [self._to_response(o) for o in openings]

    async def get_opening(self, opening_id: str) -> Optional[OpeningResponse]:
        opening = await self.opening_repo.find_by_id(opening_id)
        if not opening:
            return None
        return self._to_response(opening)

    async def create_opening(
        self, data: dict, user="anonymous", persona=None,
    ) -> OpeningResponse:
        if not has_role(persona, "hr", "hr_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can create job openings.",
            )

        data["created_by"] = user
        data["opened_at"] = now_pkt()

        opening = await self.opening_repo.create(data)

        if self.notification_repo:
            await self.notification_repo.create(
                user_id="all",
                notif_type="Opening Created",
                title="New job opening",
                message=f"Position '{opening.title}' has been opened in {opening.department}.",
            )

        return self._to_response(opening)

    async def update_opening(
        self, opening_id: str, data: dict, user="anonymous", persona=None,
    ) -> OpeningResponse:
        opening = await self.opening_repo.find_by_id(opening_id)
        if not opening:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job opening not found.",
            )

        if not has_role(persona, "hr", "hr_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can update job openings.",
            )

        if data.get("status") == "Closed" and opening.status != "Closed":
            data["closed_at"] = now_pkt()

        opening = await self.opening_repo.update(opening, data)

        if data.get("status") == "Closed" and self.notification_repo:
            await self.notification_repo.create(
                user_id="all",
                notif_type="Opening Closed",
                title="Job opening closed",
                message=f"Position '{opening.title}' has been closed.",
            )

        return self._to_response(opening)

    async def delete_opening(self, opening_id: str, persona=None) -> None:
        if not has_role(persona, "hr", "hr_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR can delete job openings.",
            )

        opening = await self.opening_repo.find_by_id(opening_id)
        if not opening:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job opening not found.",
            )

        await self.opening_repo.update(opening, {"status": "Closed", "closed_at": now_pkt()})

    def _to_response(self, opening: JobOpening) -> OpeningResponse:
        resp = OpeningResponse.model_validate(opening)
        resp.candidate_count = len(opening.candidates) if opening.candidates else 0
        return resp
