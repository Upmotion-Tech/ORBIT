from datetime import datetime

from fastapi import HTTPException, status

from app.repositories.leave_policy_repository import LeavePolicyRepository
from app.schemas.leave_policy import LeavePolicyUpdate, LeavePolicyResponse
from app.core.time import now_pkt
from app.core.permissions import has_role


class LeavePolicyService:
    def __init__(
        self,
        policy_repo: LeavePolicyRepository,
    ):
        self.policy_repo = policy_repo

    async def get_policy(self) -> LeavePolicyResponse:
        policy = await self.policy_repo.get_current()
        if not policy:
            from app.models.leave_policy import LeavePolicy
            from app.core.database import async_session_factory
            policy = LeavePolicy(
                casual_days=12,
                sick_days=7,
                annual_days=14,
                year=datetime.now().year,
            )
            async with async_session_factory() as session:
                session.add(policy)
                await session.commit()
                await session.refresh(policy)
            return LeavePolicyResponse.model_validate(policy)
        return LeavePolicyResponse.model_validate(policy)

    async def update_policy(
        self, data: dict, user="anonymous", persona=None,
    ) -> LeavePolicyResponse:
        if not has_role(persona, "hr", "owner"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only HR or Owner can update leave policy.",
            )

        year = datetime.now().year
        data["year"] = year
        data["updated_by"] = user

        policy = await self.policy_repo.upsert(data)
        return LeavePolicyResponse.model_validate(policy)
