from datetime import date, datetime
from typing import Optional

from fastapi import HTTPException, status

from app.core.time import now_pkt
from app.models.project import Project
from app.repositories.project_repository import ProjectRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.project import ProjectResponse


class ProjectService:
    def __init__(
        self,
        project_repo: ProjectRepository,
        lead_repo: Optional[LeadRepository] = None,
        notification_repo: Optional[NotificationRepository] = None,
    ):
        self.project_repo = project_repo
        self.lead_repo = lead_repo
        self.notification_repo = notification_repo

    async def list_projects(
        self,
        search: Optional[str] = None,
        client: Optional[str] = None,
        status_filter: Optional[str] = None,
        team_member: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        persona: str = "owner",
    ) -> list[ProjectResponse]:
        # Enforce project visibility: dev only sees projects they are assigned to
        assigned_to_member = "Kofi Mensah" if persona == "dev" else None
        
        projects = await self.project_repo.find_all(
            search=search,
            client=client,
            status=status_filter,
            team_member=team_member,
            date_from=date_from,
            date_to=date_to,
            assigned_to_member=assigned_to_member,
        )

        return [self._to_response(p, persona) for p in projects]

    async def get_project(self, project_id: str, persona: str = "owner") -> Optional[ProjectResponse]:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            return None
            
        # Dev member visibility check
        if persona == "dev" and "Kofi Mensah" not in project.team:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this project.",
            )

        return self._to_response(project, persona)

    async def create_project(self, data: dict, user: str = "anonymous", persona: str = "owner") -> ProjectResponse:
        if persona not in ("owner", "admin", "finance"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to create projects.",
            )

        # Enforce deadline validation: deadline >= today on creation
        deadline = data.get("deadline")
        if deadline and isinstance(deadline, str):
            deadline = date.fromisoformat(deadline)
        if deadline and deadline < date.today():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Project deadline cannot be before creation date.",
            )

        # Check duplicate name
        name = data.get("name")
        if name:
            existing = await self.project_repo.find_by_name(name)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A project with this name already exists.",
                )

        data["created_by"] = user
        data["updated_by"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()

        project = await self.project_repo.create(data)

        # Generate notifications for assigned team members
        if self.notification_repo and project.team:
            for member in project.team:
                target_user = "dev" if member == "Kofi Mensah" else "all"
                await self.notification_repo.create(
                    user_id=target_user,
                    notif_type="Project Assigned",
                    title="Assigned to new project",
                    message=f"You have been assigned to project '{project.name}'.",
                )
                
        return self._to_response(project, persona)

    async def update_project(self, project_id: str, data: dict, user: str = "anonymous", persona: str = "owner") -> ProjectResponse:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found.",
            )

        # Enforce permissions: dev cannot edit projects
        if persona == "dev":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Dev members cannot edit project parameters.",
            )

        # Check duplicate name on update
        name = data.get("name")
        if name:
            existing = await self.project_repo.find_by_name(name)
            if existing and existing.id != project_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="A project with this name already exists.",
                )

        # Enforce deadline validation: deadline >= project created_at date
        deadline = data.get("deadline")
        if deadline:
            if isinstance(deadline, str):
                deadline = date.fromisoformat(deadline)
            created_date = project.created_at.date()
            if deadline < created_date:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Project deadline cannot be before creation date ({created_date}).",
                )

        old_team = set(project.team or [])
        data["updated_by"] = user
        updated_project = await self.project_repo.update(project, data)

        # Handle notifications for team assignment changes
        if self.notification_repo and "team" in data:
            new_team = set(updated_project.team or [])
            added = new_team - old_team
            removed = old_team - new_team

            for member in added:
                target_user = "dev" if member == "Kofi Mensah" else "all"
                await self.notification_repo.create(
                    user_id=target_user,
                    notif_type="Project Assigned",
                    title="Assigned to project",
                    message=f"You have been assigned to project '{project.name}'.",
                )

            for member in removed:
                target_user = "dev" if member == "Kofi Mensah" else "all"
                await self.notification_repo.create(
                    user_id=target_user,
                    notif_type="Removed from Project",
                    title="Removed from project",
                    message=f"You have been removed from project '{project.name}'.",
                )

        # Generate general update notification
        if self.notification_repo:
            await self.notification_repo.create(
                user_id="all",
                notif_type="Project Updated",
                title="Project updated",
                message=f"Project '{project.name}' details have been updated.",
            )

        return self._to_response(updated_project, persona)

    async def delete_project(self, project_id: str, persona: str = "owner") -> bool:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            return False

        if persona == "dev":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Dev members cannot delete projects.",
            )

        await self.project_repo.soft_delete(project)
        return True

    async def check_and_create_project_from_lead(self, lead_id: str, user: str = "anonymous") -> Optional[Project]:
        if not self.lead_repo:
            return None

        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead or lead.stage != "Won" or not lead.scope_document_url or not lead.signed_contract_url:
            return None

        # Check if project already exists
        existing = await self.project_repo.find_by_lead_id(lead_id)
        if existing:
            return existing

        # Automatically create project
        base_name = f"{lead.company_name} — Project"
        proj_name = base_name
        counter = 1
        while True:
            existing_by_name = await self.project_repo.find_by_name(proj_name)
            if not existing_by_name:
                break
            counter += 1
            proj_name = f"{base_name} {counter}"

        project_data = {
            "name": proj_name,
            "client": lead.company_name,
            "lead_id": lead.id,
            "deadline": lead.expected_closure_date or (now_pkt().date()),
            "status": "Not Started",
            "budget": lead.value,
            "description": lead.description or f"Project generated automatically from Won CRM Lead: {lead.company_name}",
            "team": [],
            "created_by": user,
            "updated_by": user,
            "created_at": now_pkt(),
            "updated_at": now_pkt(),
        }

        project = await self.project_repo.create(project_data)

        # Add scope document as first attachment
        if lead.scope_document_url:
            filename = lead.scope_document_url.rsplit("/", 1)[-1]
            await self.project_repo.add_attachment(
                project_id=project.id,
                filename=filename,
                url=lead.scope_document_url,
                size_bytes=0,  # size unknown during auto-migration
                uploaded_by="system",
            )

        # Notify Owner
        if self.notification_repo:
            await self.notification_repo.create(
                user_id="owner",
                notif_type="Project Created",
                title="New Project Auto-Created",
                message=f"Project '{project.name}' has been created automatically from Won CRM Lead.",
            )

        return project

    def _to_response(self, project: Project, persona: str) -> ProjectResponse:
        resp = ProjectResponse.model_validate(project)
        
        # Enforce financial visibility logic
        # Dev members cannot see budget, spent, profitability, etc.
        if persona == "dev":
            resp.budget = None
            
        return resp
