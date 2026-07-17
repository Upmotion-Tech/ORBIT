from datetime import date
from typing import Optional
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.core.time import now_pkt
from app.models.invoice import Invoice
from app.models.project import Project

class InvoiceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _apply_filters(
        self,
        query,
        search: Optional[str] = None,
        status: Optional[str] = None,
        currency: Optional[str] = None,
        project_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Invoice.client).contains(q),
                    func.lower(Invoice.id).contains(q),
                    func.lower(Invoice.status).contains(q),
                    func.lower(Project.name).contains(q),
                )
            )
        if status:
            query = query.where(Invoice.status == status)
        if currency:
            query = query.where(Invoice.currency == currency)
        if project_id:
            query = query.where(Invoice.project_id == project_id)
        if date_from:
            query = query.where(Invoice.issue_date >= date_from)
        if date_to:
            query = query.where(Invoice.issue_date <= date_to)
        return query

    async def count(
        self,
        search: Optional[str] = None,
        status: Optional[str] = None,
        currency: Optional[str] = None,
        project_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> int:
        query = select(func.count(Invoice.id)).outerjoin(Invoice.project).where(Invoice.deleted_at.is_(None))
        query = self._apply_filters(query, search, status, currency, project_id, date_from, date_to)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
        self,
        search: Optional[str] = None,
        status: Optional[str] = None,
        currency: Optional[str] = None,
        project_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        page: int = 1,
        page_size: int = 100,
    ) -> list[Invoice]:
        query = select(Invoice).outerjoin(Invoice.project).options(joinedload(Invoice.project)).where(Invoice.deleted_at.is_(None))
        query = self._apply_filters(query, search, status, currency, project_id, date_from, date_to)

        # Apply sorting
        sort_column = getattr(Invoice, sort_by, Invoice.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, invoice_id: str) -> Optional[Invoice]:
        query = select(Invoice).options(joinedload(Invoice.project)).where(
            Invoice.id == invoice_id,
            Invoice.deleted_at.is_(None)
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: dict) -> Invoice:
        invoice = Invoice(**data)
        self.db.add(invoice)
        await self.db.flush()
        # Refresh to load relationships
        query = select(Invoice).options(joinedload(Invoice.project)).where(Invoice.id == invoice.id)
        res = await self.db.execute(query)
        return res.scalar_one()

    async def update(self, invoice: Invoice, data: dict) -> Invoice:
        for key, value in data.items():
            setattr(invoice, key, value)
        await self.db.flush()
        # A bare refresh() expires the `project` relationship without
        # reloading it, so any access afterward (e.g. building the response)
        # tries an async lazy-load outside a valid greenlet context and
        # raises MissingGreenlet — re-fetch with the same eager-load path
        # find_by_id already uses instead.
        return await self.find_by_id(invoice.id)

    async def soft_delete(self, invoice: Invoice) -> None:
        invoice.deleted_at = now_pkt()
        await self.db.flush()
