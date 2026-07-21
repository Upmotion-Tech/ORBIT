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
        audit_repo = None,
        employee_repo = None,
    ):
        self.project_repo = project_repo
        self.lead_repo = lead_repo
        self.notification_repo = notification_repo
        self.audit_repo = audit_repo
        self.employee_repo = employee_repo

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Project", label, detail)

    async def list_projects(
        self,
        search: Optional[str] = None,
        client: Optional[str] = None,
        status_filter: Optional[str] = None,
        team_member_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        persona: str = "owner",
        user_id: str = "",
    ) -> list[ProjectResponse]:
        # Enforce project visibility: dev only sees projects they are assigned
        # to (by employee ID) — previously hardcoded to a mock name.
        assigned_to_member_id = user_id if persona == "dev" else None

        projects = await self.project_repo.find_all(
            search=search,
            client=client,
            status=status_filter,
            team_member=team_member_id,
            date_from=date_from,
            date_to=date_to,
            assigned_to_member=assigned_to_member_id,
        )

        return [self._to_response(p, persona) for p in projects]

    async def get_project(self, project_id: str, persona: str = "owner", user_id: str = "") -> Optional[ProjectResponse]:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            return None

        # Dev member visibility check
        if persona == "dev" and user_id not in project.team_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this project.",
            )

        return self._to_response(project, persona)

    async def create_project(self, data: dict, user: str = "anonymous", persona: str = "owner") -> ProjectResponse:
        # An employee holding the "dev" access level functions as Owner for
        # this module — same parity already granted to "finance"/"crm" for
        # their own modules. is_dev_editor is computed from the caller's full
        # access_levels list (has_role(roles, "owner", "dev")), not just the
        # single derived persona string, so it's correct even for someone
        # whose highest-priority derived persona happens to be something else
        # (e.g. holds both "finance" and "dev" — persona derives to "finance",
        # but they still hold "dev" and must get project-edit parity for it).
        if persona != "owner" and not is_dev_editor:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners or Dev can create projects.",
            )

        # Enforce deadline validation: deadline >= the project's own
        # start_date (falls back to today only if none is supplied — the
        # frontend's own New Project form always sends today explicitly).
        # Comparing against a hardcoded "today" here would reproduce the
        # same class of bug just fixed in update_project below if a caller
        # ever supplies a backdated start_date at creation time.
        deadline = data.get("deadline")
        if deadline and isinstance(deadline, str):
            deadline = date.fromisoformat(deadline)
        start = data.get("start_date")
        if isinstance(start, str):
            start = date.fromisoformat(start)
        start = start or date.today()
        if deadline and deadline < start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Project deadline cannot be before start date ({start}).",
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
        if self.notification_repo and project.team_ids:
            for member in project.team_ids:
                target_user = await self._resolve_member_notification_target(member)
                await self.notification_repo.create(
                    user_id=target_user,
                    notif_type="Project Assigned",
                    title="Assigned to new project",
                    message=f"You have been assigned to project '{project.name}'.",
                )

        await self._audit(user, "Created", project.name)

        return self._to_response(project, persona)

    async def update_project(self, project_id: str, data: dict, user: str = "anonymous", persona: str = "owner") -> ProjectResponse:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found.",
            )

        # Anyone with view access to Projects can be assigned/allotted to one
        # and comment on it. Editing project fields is Owner-or-Dev — see
        # create_project's comment above for why is_dev_editor (full roles
        # list) is used instead of the single derived persona string.
        if persona != "owner" and not is_dev_editor:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners or Dev can edit project details.",
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

        # Enforce deadline validation: deadline >= project start_date — was
        # comparing against the immutable created_at timestamp instead, which
        # broke the instant an owner backdated (or postdated) a project's own
        # start_date away from the moment its row happened to be created — a
        # perfectly legitimate, expected edit — since a deadline genuinely
        # fine relative to the real start date could still fall before the
        # unrelated creation timestamp.
        deadline = data.get("deadline")
        if deadline:
            if isinstance(deadline, str):
                deadline = date.fromisoformat(deadline)
            start = data.get("start_date", project.start_date)
            if isinstance(start, str):
                start = date.fromisoformat(start)
            if start and deadline < start:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Project deadline cannot be before start date ({start}).",
                )

        old_team = set(project.team_ids or [])
        old_status = project.status
        data["updated_by"] = user
        updated_project = await self.project_repo.update(project, data)

        # Handle notifications for team assignment changes
        if self.notification_repo and "team" in data:
            new_team = set(updated_project.team_ids or [])
            added = new_team - old_team
            removed = old_team - new_team

            for member in added:
                target_user = await self._resolve_member_notification_target(member)
                await self.notification_repo.create(
                    user_id=target_user,
                    notif_type="Project Assigned",
                    title="Assigned to project",
                    message=f"You have been assigned to project '{project.name}'.",
                )

            for member in removed:
                target_user = await self._resolve_member_notification_target(member)
                await self.notification_repo.create(
                    user_id=target_user,
                    notif_type="Removed from Project",
                    title="Removed from project",
                    message=f"You have been removed from project '{project.name}'.",
                )

        # A generic "Project Updated" broadcast-to-everyone notification used
        # to fire here on every save — including every debounced per-field
        # auto-save the Project drawer already does — which meant the whole
        # company got a notification on every keystroke-driven edit to any
        # project. Removed entirely: team-assignment changes above already
        # notify the people who actually need to know.

        if "status" in data and updated_project.status != old_status:
            await self._audit(user, "Status Changed", updated_project.name, f"'{old_status}' → '{updated_project.status}'")
        else:
            changed = sorted(k for k in data.keys() if k != "updated_by")
            await self._audit(user, "Updated", updated_project.name, f"Fields updated: {', '.join(changed)}" if changed else None)

        return self._to_response(updated_project, persona)

    async def delete_project(self, project_id: str, persona: str = "owner", user: str = "anonymous") -> bool:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            return False

        if persona != "owner" and not is_dev_editor:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owners or Dev can delete projects.",
            )

        await self._audit(user, "Deleted", project.name)
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
            "start_date": lead.actual_closure_date or now_pkt().date(),
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

        # Budget/spend visibility: Owner or Dev-access-level holders see it
        # (Dev now functions as Owner for this module); everyone else with
        # mere view access to Projects can see everything else and comment,
        # just not price.
        if persona != "owner" and not is_dev_editor:
            resp.budget = None

        return resp
