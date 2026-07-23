from datetime import date
from typing import Optional

from app.core.time import now_pkt
from app.core.permissions import has_role
from app.models.lead import Lead
from app.repositories.lead_repository import LeadRepository
from app.repositories.activity_repository import ActivityRepository
from app.schemas.lead import LeadResponse, LeadListResponse
from app.schemas.lead_activity import ActivityResponse, ActivityListResponse
from app.services.storage_service import storage_service


VALID_STAGES = ["New", "Contacted", "Proposal", "Negotiation", "Won", "Lost"]

STAGE_WORKFLOW = {
    "New": ["Contacted", "Won", "Lost"],
    "Contacted": ["Proposal", "Lost"],
    "Proposal": ["Negotiation", "Lost"],
    "Negotiation": ["Won", "Lost"],
    "Won": [],
    "Lost": [],
}


class LeadService:
    def __init__(
        self,
        lead_repo: LeadRepository,
        activity_repo: ActivityRepository,
        project_repo = None,
        notification_repo = None,
        audit_repo = None,
        customer_repo = None,
        employee_repo = None,
    ):
        self.lead_repo = lead_repo
        self.activity_repo = activity_repo
        self.project_repo = project_repo
        self.notification_repo = notification_repo
        self.audit_repo = audit_repo
        self.customer_repo = customer_repo
        self.employee_repo = employee_repo

    async def _notify_assigned_rep(self, lead: Lead) -> None:
        # assigned_rep is a free-text name (not an FK — see the Lead model),
        # so it only becomes a real notification if it matches a real
        # employee exactly; a typo'd or not-yet-onboarded name just silently
        # doesn't notify anyone, same as the manager-name resolution pattern
        # used for leave/WFH notifications.
        if not (self.notification_repo and self.employee_repo and lead.assigned_rep):
            return
        rep = await self.employee_repo.find_by_exact_name(lead.assigned_rep)
        if not rep:
            return
        await self.notification_repo.create(
            user_id=rep.id,
            notif_type="Lead Assigned",
            title="Assigned to lead",
            message=f"You have been assigned to lead '{lead.company_name}'.",
            related_type="lead",
            related_id=lead.id,
        )

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Lead", label, detail)

    async def list_leads(
        self,
        search: Optional[str] = None,
        stage: Optional[str] = None,
        source: Optional[str] = None,
        assigned_rep: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        overdue_only: bool = False,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        page: int = 1,
        page_size: int = 50,
        persona_roles: Optional[list] = None,
    ) -> LeadListResponse:
        total = await self.lead_repo.count(search, stage, source, assigned_rep, date_from, date_to, overdue_only)
        leads = await self.lead_repo.find_all(
            search, stage, source, assigned_rep, date_from, date_to, overdue_only,
            sort_by, sort_dir, page, page_size,
        )
        total_pages = max(1, (total + page_size - 1) // page_size)

        return LeadListResponse(
            items=[self._to_response(l, persona_roles) for l in leads],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    async def get_lead(self, lead_id: str, persona_roles: Optional[list] = None) -> Optional[LeadResponse]:
        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead:
            return None
        return self._to_response(lead, persona_roles)

    async def create_lead(self, data: dict, user: str = "anonymous", persona_roles: Optional[list] = None) -> tuple[LeadResponse, Optional[str]]:
        data["created_by"] = user
        data["updated_by"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()

        await self._resolve_customer(data, user)

        warning = None
        duplicates = await self.lead_repo.find_duplicates(
            company_name=data.get("company_name"),
            client_contact_name=data.get("client_contact_name"),
        )
        if duplicates:
            warning = f"Similar lead(s) already exist: {', '.join(d.company_name for d in duplicates[:3])}"

        lead = await self.lead_repo.create(data)

        await self.activity_repo.create({
            "lead_id": lead.id,
            "type": "create",
            "note": f"Lead created in stage '{lead.stage}'",
            "created_by": user,
        })
        await self._audit(user, "Created", lead.company_name, f"Stage '{lead.stage}'")
        await self._notify_assigned_rep(lead)

        return self._to_response(lead, persona_roles), warning

    async def _resolve_customer(self, data: dict, user: str) -> None:
        # A Lead's company_name/client_contact_name auto-creates (or reuses)
        # a Customer profile — either the one explicitly picked via the
        # frontend's "select existing customer" dropdown (customer_id
        # already set), or matched/created by company name here.
        if not self.customer_repo:
            return

        customer_id = data.get("customer_id")
        if customer_id:
            existing = await self.customer_repo.find_by_id(customer_id)
            if existing:
                return
            # A stale/invalid id shouldn't block lead creation — fall
            # through to the normal match-or-create path below instead.
            data["customer_id"] = None

        from app.services.customer_service import CustomerService
        customer_service = CustomerService(self.customer_repo, self.audit_repo)
        customer = await customer_service.find_or_create_from_lead(
            data.get("company_name"), data.get("client_contact_name"), user,
        )
        if customer:
            data["customer_id"] = customer.id

    async def update_lead(self, lead_id: str, data: dict, user: str = "anonymous", persona_roles: Optional[list] = None) -> tuple[Optional[LeadResponse], Optional[str], Optional[str]]:
        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead:
            return None, None, "Lead not found"

        data["updated_by"] = user

        warning = None
        if data.get("company_name") or data.get("client_contact_name"):
            duplicates = await self.lead_repo.find_duplicates(
                company_name=data.get("company_name"),
                client_contact_name=data.get("client_contact_name"),
                exclude_id=lead_id,
            )
            if duplicates:
                warning = f"Similar lead(s) already exist: {', '.join(d.company_name for d in duplicates[:3])}"

        if data.get("stage") in ("Won", "Lost"):
            pass
        elif lead.stage in ("Won", "Lost") and data.get("stage") and data["stage"] != lead.stage:
            pass

        old_stage = lead.stage
        old_rep = lead.assigned_rep
        lead = await self.lead_repo.update(lead, data)

        if "assigned_rep" in data and lead.assigned_rep and lead.assigned_rep != old_rep:
            await self._notify_assigned_rep(lead)

        if "stage" in data and data["stage"] != old_stage:
            await self.activity_repo.create({
                "lead_id": lead.id,
                "type": "stage_change",
                "note": f"Stage changed from '{old_stage}' to '{lead.stage}'",
                "created_by": user,
            })
            await self._audit(user, "Stage Changed", lead.company_name, f"'{old_stage}' → '{lead.stage}'")
        else:
            changed = sorted(k for k in data.keys() if k != "updated_by")
            await self._audit(user, "Updated", lead.company_name, f"Fields updated: {', '.join(changed)}" if changed else None)

        await self._check_auto_project(lead, user)

        return self._to_response(lead, persona_roles), warning, None

    async def change_stage(self, lead_id: str, stage: str, user: str = "anonymous", is_owner: bool = False, persona_roles: Optional[list] = None) -> tuple[Optional[LeadResponse], Optional[str]]:
        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead:
            return None, "Lead not found"

        if not is_owner and stage not in STAGE_WORKFLOW.get(lead.stage, []):
            return None, f"Cannot move from '{lead.stage}' to '{stage}'. Valid transitions: {STAGE_WORKFLOW.get(lead.stage, [])}"

        if stage == "Won" and not is_owner:
            return None, "Only owners can move a lead directly to 'Won'. Valid transitions: Contacted, Lost"

        old_stage = lead.stage
        lead = await self.lead_repo.update_stage(lead, stage)

        await self.activity_repo.create({
            "lead_id": lead.id,
            "type": "stage_change",
            "note": f"Stage changed from '{old_stage}' to '{stage}'",
            "created_by": user,
        })
        await self._audit(user, "Stage Changed", lead.company_name, f"'{old_stage}' → '{stage}'")

        await self._check_auto_project(lead, user)

        return self._to_response(lead, persona_roles), None

    async def delete_lead(self, lead_id: str, user: str = "anonymous") -> bool:
        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead:
            return False

        await self.activity_repo.create({
            "lead_id": lead.id,
            "type": "delete",
            "note": f"Lead '{lead.company_name}' deleted",
            "created_by": user,
        })
        await self._audit(user, "Deleted", lead.company_name)

        await self.lead_repo.soft_delete(lead)
        return True

    async def search_leads(self, query: str, limit: int = 20, persona_roles: Optional[list] = None) -> LeadListResponse:
        leads = await self.lead_repo.search_global(query, limit)
        return LeadListResponse(
            items=[self._to_response(l, persona_roles) for l in leads],
            total=len(leads),
            page=1,
            page_size=limit,
            total_pages=1,
        )

    async def upload_document(self, lead_id: str, doc_type: str, url: str, user: str = "anonymous", persona_roles: Optional[list] = None) -> tuple[Optional[LeadResponse], Optional[str]]:
        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead:
            return None, "Lead not found"

        update_data = {}
        if doc_type == "scope_document":
            update_data["scope_document_url"] = url
        elif doc_type == "signed_contract":
            update_data["signed_contract_url"] = url
        else:
            return None, f"Unknown document type: {doc_type}"

        lead = await self.lead_repo.update(lead, update_data)

        if lead.scope_document_url and lead.signed_contract_url:
            await self.lead_repo.update(lead, {"is_locked_revenue": True})
            lead.is_locked_revenue = True

        await self.activity_repo.create({
            "lead_id": lead.id,
            "type": "file_upload",
            "note": f"{doc_type.replace('_', ' ').title()} uploaded",
            "created_by": user,
        })
        
        await self._check_auto_project(lead, user)

        return self._to_response(lead, persona_roles), None

    async def remove_document(self, lead_id: str, doc_type: str, user: str = "anonymous", persona_roles: Optional[list] = None) -> tuple[Optional[LeadResponse], Optional[str]]:
        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead:
            return None, "Lead not found"

        url_field = {"scope_document": "scope_document_url", "signed_contract": "signed_contract_url"}.get(doc_type)
        if not url_field:
            return None, f"Unknown document type: {doc_type}"

        existing_url = getattr(lead, url_field)
        if not existing_url:
            return None, f"{doc_type.replace('_', ' ').title()} is not attached"

        filename = existing_url.rsplit("/", 1)[-1]
        await storage_service.delete(filename)

        lead = await self.lead_repo.update(lead, {url_field: None, "is_locked_revenue": False})

        await self.activity_repo.create({
            "lead_id": lead.id,
            "type": "file_remove",
            "note": f"{doc_type.replace('_', ' ').title()} removed",
            "created_by": user,
        })

        return self._to_response(lead, persona_roles), None

    async def get_activities(self, lead_id: str, page: int = 1, page_size: int = 50) -> ActivityListResponse:
        total = await self.activity_repo.count_by_lead(lead_id)
        activities = await self.activity_repo.find_by_lead(lead_id, page, page_size)
        return ActivityListResponse(
            items=[ActivityResponse.model_validate(a) for a in activities],
            total=total,
        )

    async def create_activity(self, lead_id: str, data: dict, user: str = "anonymous") -> tuple[Optional[ActivityResponse], Optional[str]]:
        lead = await self.lead_repo.find_by_id(lead_id)
        if not lead:
            return None, "Lead not found"

        data["lead_id"] = lead_id
        data["created_by"] = user
        activity = await self.activity_repo.create(data)
        return ActivityResponse.model_validate(activity), None

    def _to_response(self, lead: Lead, persona_roles: Optional[list] = None) -> LeadResponse:
        today = now_pkt().date()
        is_overdue = (
            lead.follow_up_date is not None
            and lead.follow_up_date < today
            and lead.stage not in ("Won", "Lost")
        )
        resp = LeadResponse.model_validate(lead)
        resp.is_overdue_follow_up = is_overdue

        # An employee holding the "crm" access level functions as Owner for
        # this module — full view, including deal value. Only someone with
        # neither role (e.g. granted view access to CRM through a different
        # access level) has value redacted.
        if not has_role(persona_roles, "owner", "crm"):
            resp.value = None

        return resp

    async def _check_auto_project(self, lead: Lead, user: str) -> None:
        if self.project_repo and lead.stage == "Won" and lead.scope_document_url and lead.signed_contract_url:
            from app.services.project_service import ProjectService
            project_service = ProjectService(self.project_repo, self.lead_repo, self.notification_repo)
            await project_service.check_and_create_project_from_lead(lead.id, user)
