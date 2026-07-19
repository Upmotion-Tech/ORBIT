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
        # "owner" added here after finding a real, pre-existing gap while
        # extending this to Finance: a plain ["owner"]-only account (no
        # separate "hr" tag) was actually getting 403'd on this endpoint,
        # despite Owner being expected to have full parity with HR-scope
        # actions everywhere else in the app.
        if not has_role(persona, "owner", "hr", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner, HR, or Finance can create job openings.",
            )

        data["created_by"] = user
        data["opened_at"] = now_pkt()

        opening = await self.opening_repo.create(data)

        if self.notification_repo:
            # Owner-only — HR (the only role that can create an opening,
            # enforced above) already knows; a random employee with no HR
            # involvement has no reason to be told about internal hiring.
            await self.notification_repo.create(
                user_id="owner",
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

        if not has_role(persona, "owner", "hr", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner, HR, or Finance can update job openings.",
            )

        if data.get("status") == "Closed" and opening.status != "Closed":
            data["closed_at"] = now_pkt()

        opening = await self.opening_repo.update(opening, data)

        if data.get("status") == "Closed" and self.notification_repo:
            await self.notification_repo.create(
                user_id="owner",
                notif_type="Opening Closed",
                title="Job opening closed",
                message=f"Position '{opening.title}' has been closed.",
            )

        return self._to_response(opening)

    async def delete_opening(self, opening_id: str, persona=None) -> None:
        # Matches create_opening/update_opening's allowed roles — leaving
        # delete on the old HR-only check would have quietly reintroduced
        # the same "Owner blocked without a separate HR tag" gap just fixed
        # for create/update, one action later.
        if not has_role(persona, "owner", "hr", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner, HR, or Finance can delete job openings.",
            )

        opening = await self.opening_repo.find_by_id(opening_id)
        if not opening:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Job opening not found.",
            )

        # Was previously just setting status to "Closed" — a genuine bug,
        # since "Closed" is already its own real, separate concept exposed
        # via the opening's own Status dropdown (update_opening). A DELETE
        # endpoint returning 204 No Content should actually delete, and this
        # was never reachable from the frontend anyway (no UI ever called
        # it), so repurposing it to a real hard-delete doesn't remove any
        # working "close an opening" path — that already exists separately.
        await self.opening_repo.delete(opening)

    def _to_response(self, opening: JobOpening) -> OpeningResponse:
        resp = OpeningResponse.model_validate(opening)
        resp.candidate_count = len(opening.candidates) if opening.candidates else 0
        return resp
