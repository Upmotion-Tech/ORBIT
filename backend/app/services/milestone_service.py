from datetime import date
from typing import Optional
from fastapi import HTTPException, status
from app.models.milestone import Milestone
from app.repositories.milestone_repository import MilestoneRepository
from app.repositories.notification_repository import NotificationRepository

class MilestoneService:
    def __init__(self, milestone_repo: MilestoneRepository, notification_repo: Optional[NotificationRepository] = None, audit_repo = None):
        self.milestone_repo = milestone_repo
        self.notification_repo = notification_repo
        self.audit_repo = audit_repo

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Milestone", label, detail)

    async def list_milestones(self, **kwargs) -> list[Milestone]:
        return await self.milestone_repo.find_all(**kwargs)

    async def get_milestone(self, milestone_id: str) -> Optional[Milestone]:
        return await self.milestone_repo.find_by_id(milestone_id)

    async def create_milestone(self, data: dict, user: str = "anonymous") -> Milestone:
        data["created_by"] = user
        data["updated_by"] = user
        milestone = await self.milestone_repo.create(data)

        if self.notification_repo:
            message = f"New milestone '{milestone.name}' of {milestone.currency} {milestone.amount:,.2f} expected for project '{milestone.project.name if milestone.project else 'N/A'}'."
            await self.notification_repo.create(user_id="finance", notif_type="Milestone Created", title="Milestone Scheduled", message=message)
            await self.notification_repo.create(user_id="owner", notif_type="Milestone Created", title="Milestone Scheduled", message=message)
        await self._audit(user, "Created", milestone.name)
        return milestone

    async def update_milestone(self, milestone_id: str, data: dict, user: str = "anonymous") -> Milestone:
        milestone = await self.milestone_repo.find_by_id(milestone_id)
        if not milestone:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")

        old_status = milestone.status
        data["updated_by"] = user
        updated_milestone = await self.milestone_repo.update(milestone, data)

        new_status = updated_milestone.status
        if old_status != new_status and self.notification_repo:
            notif_type = f"Milestone {new_status}"
            title = f"Milestone Marked as {new_status}"
            message = f"Milestone '{milestone.name}' for project '{milestone.project.name if milestone.project else 'N/A'}' status changed to {new_status}."
            
            await self.notification_repo.create(user_id="finance", notif_type=notif_type, title=title, message=message)
            await self.notification_repo.create(user_id="owner", notif_type=notif_type, title=title, message=message)

        if old_status != new_status:
            await self._audit(user, "Status Changed", updated_milestone.name, f"'{old_status}' → '{new_status}'")
        else:
            await self._audit(user, "Updated", updated_milestone.name)

        return updated_milestone

    async def delete_milestone(self, milestone_id: str, user: str = "anonymous") -> None:
        milestone = await self.milestone_repo.find_by_id(milestone_id)
        if not milestone:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found.")
        await self._audit(user, "Deleted", milestone.name)
        await self.milestone_repo.soft_delete(milestone)
