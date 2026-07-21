from typing import Optional

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.lead import Lead
from app.core.time import now_pkt


class CustomerRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(self, search: Optional[str] = None) -> int:
        query = select(func.count(Customer.id)).where(Customer.deleted_at.is_(None))
        query = self._apply_search(query, search)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self, search: Optional[str] = None,
        sort_by: str = "company_name", sort_dir: str = "asc",
        page: int = 1, page_size: int = 200,
    ) -> list[Customer]:
        query = select(Customer).where(Customer.deleted_at.is_(None))
        query = self._apply_search(query, search)
        sort_col = getattr(Customer, sort_by, Customer.company_name)
        order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
        query = query.order_by(order)
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, customer_id: str) -> Optional[Customer]:
        query = select(Customer).where(Customer.id == customer_id, Customer.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_company_name_exact(self, company_name: str) -> Optional[Customer]:
        # Used to auto-link a new Lead to an existing Customer instead of
        # creating a duplicate — case-insensitive exact match (not
        # "contains", which risks matching an unrelated company whose name
        # happens to be a substring).
        query = select(Customer).where(
            func.lower(Customer.company_name) == company_name.strip().lower(),
            Customer.deleted_at.is_(None),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> Customer:
        customer = Customer(**data)
        self.db.add(customer)
        await self.db.flush()
        return customer

    async def update(self, customer: Customer, data: dict) -> Customer:
        for key, value in data.items():
            setattr(customer, key, value)
        customer.updated_at = now_pkt()
        await self.db.flush()
        return customer

    async def soft_delete(self, customer: Customer) -> None:
        customer.deleted_at = now_pkt()
        await self.db.flush()

    async def count_leads_by_customer_ids(self, customer_ids: list[str]) -> dict[str, int]:
        if not customer_ids:
            return {}
        query = (
            select(Lead.customer_id, func.count(Lead.id))
            .where(Lead.customer_id.in_(customer_ids), Lead.deleted_at.is_(None))
            .group_by(Lead.customer_id)
        )
        result = await self.db.execute(query)
        return {row[0]: row[1] for row in result.all()}

    def _apply_search(self, query, search: Optional[str]):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Customer.company_name).contains(q),
                    func.lower(Customer.primary_contact_name).contains(q),
                    func.lower(Customer.primary_contact_email).contains(q),
                )
            )
        return query
