import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy import Policy


class PolicyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def find_all(self) -> list[Policy]:
        result = await self.db.execute(
            select(Policy).order_by(Policy.created_at.desc())
        )
        return list(result.scalars().all())

    async def find_by_id(self, policy_id: str) -> Policy | None:
        result = await self.db.execute(
            select(Policy).where(Policy.id == policy_id)
        )
        return result.scalar_one_or_none()

    async def create(self, data: dict, created_by_id: str | None) -> Policy:
        policy = Policy(id=str(uuid.uuid4()), created_by_id=created_by_id, **data)
        self.db.add(policy)
        await self.db.flush()
        return policy

    async def update(self, policy: Policy, data: dict) -> Policy:
        for key, value in data.items():
            setattr(policy, key, value)
        await self.db.flush()
        return policy

    async def delete(self, policy: Policy) -> None:
        await self.db.delete(policy)
        await self.db.flush()
