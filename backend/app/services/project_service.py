from datetime import date
from typing import Optional

from fastapi import HTTPException, status

from app.core.time import now_pkt
from app.models.project import Project
from app.repositories.project_repository import ProjectRepository
from app.repositories.lead_repository import LeadRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.project import ProjectResponse


from app.core.permissions import is_dev_member


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
        is_dev_editor: bool = False,
        department: str = "",
        roles: Optional[list] = None,
    ) -> list[ProjectResponse]:
        # Enforce project visibility: a Dev Member department employee (who is
        # not an Owner) only sees projects they are assigned to.
        assigned_to_member_id = user_id if is_dev_member(roles, department) else None

        projects = await self.project_repo.find_all(
            search=search,
            client=client,
            status=status_filter,
            team_member=team_member_id,
            date_from=date_from,
            date_to=date_to,
            assigned_to_member=assigned_to_member_id,
        )

        return [self._to_response(p, persona, is_dev_editor) for p in projects]

    async def get_project(
        self,
        project_id: str,
        persona: str = "owner",
        user_id: str = "",
        is_dev_editor: bool = False,
        department: str = "",
        roles: Optional[list] = None,
    ) -> Optional[ProjectResponse]:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            return None

        # Dev Member department visibility check
        if is_dev_member(roles, department) and user_id not in (project.team_ids or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this project.",
            )

        return self._to_response(project, persona, is_dev_editor)


    async def create_project(self, data: dict, user: str = "anonymous", persona: str = "owner", is_dev_editor: bool = False) -> ProjectResponse:
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

        data["created_by_id"] = user
        data["updated_by_id"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()

        project = await self.project_repo.create(data)

        # Generate notifications for assigned team members. team_ids holds
        # employee IDs directly (not names) since the ID migration, so no
        # name-resolution step is needed — the ID *is* the notification target.
        if self.notification_repo and project.team_ids:
            for member_id in project.team_ids:
                await self.notification_repo.create(
                    user_id=member_id,
                    notif_type="Project Assigned",
                    title="Assigned to new project",
                    message=f"You have been assigned to project '{project.name}'.",
                    related_type="project",
                    related_id=project.id,
                )

        await self._audit(user, "Created", project.name)

        return self._to_response(project, persona, is_dev_editor)

    async def update_project(
        self,
        project_id: str,
        data: dict,
        user: str = "anonymous",
        persona: str = "owner",
        is_dev_editor: bool = False,
        department: str = "",
        roles: Optional[list] = None,
    ) -> ProjectResponse:

        project = await self.project_repo.find_by_id(project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found.",
            )

        # Dev Member department engineers assigned to a project can update its status.
        # Editing other project details (budget, name, team_ids, etc.) remains Owner/Dev Editor only.
        is_dev_scoped = is_dev_member(roles, department)
        if is_dev_scoped:
            if user not in (project.team_ids or []):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to this project.",
                )
            non_status_fields = [k for k in data.keys() if k not in ("status", "updated_by_id", "updated_at")]
            if non_status_fields:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Dev Member engineers can only change project status, not project details.",
                )
        elif persona != "owner" and not is_dev_editor:
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
        if "status" in data and data["status"] != old_status:
            if data["status"] == "Completed":
                data["completed_at"] = now_pkt()
            elif old_status == "Completed":
                data["completed_at"] = None
        data["updated_by_id"] = user
        updated_project = await self.project_repo.update(project, data)

        # Handle notifications for team assignment changes. team_ids holds
        # employee IDs directly, so no name-resolution step is needed.
        if self.notification_repo and "team_ids" in data:
            new_team = set(updated_project.team_ids or [])
            added = new_team - old_team
            removed = old_team - new_team

            for member_id in added:
                await self.notification_repo.create(
                    user_id=member_id,
                    notif_type="Project Assigned",
                    title="Assigned to project",
                    message=f"You have been assigned to project '{project.name}'.",
                    related_type="project",
                    related_id=project.id,
                )

            for member_id in removed:
                await self.notification_repo.create(
                    user_id=member_id,
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
            changed = sorted(k for k in data.keys() if k != "updated_by_id")
            await self._audit(user, "Updated", updated_project.name, f"Fields updated: {', '.join(changed)}" if changed else None)

        return self._to_response(updated_project, persona, is_dev_editor)

    async def delete_project(self, project_id: str, persona: str = "owner", user: str = "anonymous", is_dev_editor: bool = False) -> bool:
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
        if not lead or lead.stage != "Won" or not lead.scope_document_data or not lead.signed_contract_data:
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

        # `user` is the real employee ID now (leads.py passes
        # current_user["user_id"], not the JWT "sub"/email anymore) — used
        # directly, no email lookup needed. created_by_id/updated_by_id are
        # real FKs to employees.id, so this must never be a raw email string.
        created_by_id = user if user and user != "anonymous" else None

        project_data = {
            "name": proj_name,
            "client": lead.company_name,
            "lead_id": lead.id,
            "start_date": lead.actual_closure_date or now_pkt().date(),
            "deadline": lead.expected_closure_date or (now_pkt().date()),
            "status": "Not Started",
            "budget": lead.value,
            "description": lead.description or f"Project generated automatically from Won CRM Lead: {lead.company_name}",
            "team_ids": [],
            "created_by_id": created_by_id,
            "updated_by_id": created_by_id,
            "created_at": now_pkt(),
            "updated_at": now_pkt(),
        }

        project = await self.project_repo.create(project_data)

        # Add scope document as first attachment
        if lead.scope_document_data:
            await self.project_repo.add_attachment(
                project_id=project.id,
                filename=lead.scope_document_filename or "scope-document.pdf",
                file_data=lead.scope_document_data,
                size_bytes=len(lead.scope_document_data),
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

    def _to_response(self, project: Project, persona: str, is_dev_editor: bool = False) -> ProjectResponse:
        resp = ProjectResponse.model_validate(project)

        # Budget/spend visibility: Owner or Dev-access-level holders see it
        # (Dev now functions as Owner for this module); everyone else with
        # mere view access to Projects can see everything else and comment,
        # just not price.
        if persona != "owner" and not is_dev_editor:
            resp.budget = None

        return resp

    async def get_project_audit(
        self,
        project_id: str,
        user_id: str = "",
        department: str = "",
        roles: Optional[list] = None,
    ) -> list:
        project = await self.project_repo.find_by_id(project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found.",
            )

        if is_dev_member(roles, department) and user_id not in (project.team_ids or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to this project.",
            )

        if not self.audit_repo:
            return []

        logs = await self.audit_repo.find_by_entity("Project", project.name, limit=50)
        from app.schemas.audit_log import AuditLogResponse
        return [AuditLogResponse.model_validate(l) for l in logs]

