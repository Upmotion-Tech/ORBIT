from typing import Optional

from fastapi import HTTPException, status

from app.core.permissions import has_role
from app.core.time import now_pkt
from app.models.customer import Customer
from app.repositories.customer_repository import CustomerRepository
from app.schemas.customer import CustomerResponse


class CustomerService:
    def __init__(self, customer_repo: CustomerRepository, audit_repo=None):
        self.customer_repo = customer_repo
        self.audit_repo = audit_repo

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Customer", label, detail)

    async def list_customers(self, search: Optional[str] = None, page: int = 1, page_size: int = 200) -> list[CustomerResponse]:
        customers = await self.customer_repo.find_all(search=search, page=page, page_size=page_size)
        counts = await self.customer_repo.count_leads_by_customer_ids([c.id for c in customers])
        return [self._to_response(c, counts.get(c.id, 0)) for c in customers]

    async def get_customer(self, customer_id: str) -> Optional[CustomerResponse]:
        customer = await self.customer_repo.find_by_id(customer_id)
        if not customer:
            return None
        counts = await self.customer_repo.count_leads_by_customer_ids([customer.id])
        return self._to_response(customer, counts.get(customer.id, 0))

    async def create_customer(self, data: dict, user: str = "anonymous", persona: Optional[list] = None) -> CustomerResponse:
        if not has_role(persona, "owner", "customers"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner or Customers-access employees can add customers.",
            )

        data["created_by_id"] = user
        data["updated_by_id"] = user
        data["created_at"] = now_pkt()
        data["updated_at"] = now_pkt()

        customer = await self.customer_repo.create(data)
        await self._audit(user, "Created", customer.company_name)
        return self._to_response(customer, 0)

    async def update_customer(self, customer_id: str, data: dict, user: str = "anonymous", persona: Optional[list] = None) -> CustomerResponse:
        if not has_role(persona, "owner", "customers"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner or Customers-access employees can edit customers.",
            )

        customer = await self.customer_repo.find_by_id(customer_id)
        if not customer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found.")

        data["updated_by_id"] = user
        customer = await self.customer_repo.update(customer, data)

        changed = sorted(k for k in data.keys() if k != "updated_by_id")
        await self._audit(user, "Updated", customer.company_name, f"Fields updated: {', '.join(changed)}" if changed else None)

        counts = await self.customer_repo.count_leads_by_customer_ids([customer.id])
        return self._to_response(customer, counts.get(customer.id, 0))

    async def delete_customer(self, customer_id: str, user: str = "anonymous", persona: Optional[list] = None) -> bool:
        if not has_role(persona, "owner", "customers"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Owner or Customers-access employees can delete customers.",
            )

        customer = await self.customer_repo.find_by_id(customer_id)
        if not customer:
            return False

        await self._audit(user, "Deleted", customer.company_name)
        await self.customer_repo.soft_delete(customer)
        return True

    async def find_or_create_from_lead(self, company_name: str, contact_name: Optional[str], user: str = "anonymous") -> Optional[Customer]:
        # Called from lead_service.create_lead — reuses an existing customer
        # whose company name matches exactly (case-insensitive) instead of
        # creating a duplicate; auto-creates one otherwise. Deliberately no
        # permission check here — this is an automatic side effect of
        # creating a lead (which is already permission-checked by the CRM
        # editor gate), not a direct user-facing customer-management action.
        if not company_name or not company_name.strip():
            return None

        existing = await self.customer_repo.find_by_company_name_exact(company_name)
        if existing:
            return existing

        customer = await self.customer_repo.create({
            "company_name": company_name.strip(),
            "primary_contact_name": contact_name,
            "created_by_id": user if user and user != "anonymous" else None,
            "updated_by_id": user if user and user != "anonymous" else None,
            "created_at": now_pkt(),
            "updated_at": now_pkt(),
        })
        await self._audit(user, "Auto-Created", customer.company_name, "From new lead")
        return customer

    def _to_response(self, customer: Customer, lead_count: int) -> CustomerResponse:
        resp = CustomerResponse.model_validate(customer)
        resp.lead_count = lead_count
        return resp
