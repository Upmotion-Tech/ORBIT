import uuid
from datetime import date
from typing import Optional

from sqlalchemy import select, func, or_, and_, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.time import now_pkt
from app.models.lead import Lead

# The two closed/terminal stages. Kept here rather than imported from
# LeadService (a repository importing a service would invert this codebase's
# router -> service -> repository layering) and deliberately narrower than
# that module's VALID_STAGES/STAGE_WORKFLOW, which describe the whole
# pipeline. Only update_stage below needs it, to stamp Lead.closed_at.
TERMINAL_STAGES = ("Won", "Lost")


class LeadRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def count(
        self,
        search: Optional[str] = None,
        stage: Optional[str] = None,
        source: Optional[str] = None,
        assigned_rep: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        overdue_only: bool = False,
    ) -> int:
        query = select(func.count(Lead.id)).where(Lead.deleted_at.is_(None))
        query = self._apply_filters(query, search, stage, source, assigned_rep, date_from, date_to, overdue_only)
        result = await self.db.execute(query)
        return result.scalar_one()

    async def find_all(
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
    ) -> list[Lead]:
        query = select(Lead).where(Lead.deleted_at.is_(None))
        query = self._apply_filters(query, search, stage, source, assigned_rep, date_from, date_to, overdue_only)

        sort_column = getattr(Lead, sort_by, Lead.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_by_id(self, lead_id: str) -> Optional[Lead]:
        query = select(Lead).where(Lead.id == lead_id, Lead.deleted_at.is_(None))
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_id_with_activities(self, lead_id: str) -> Optional[Lead]:
        query = (
            select(Lead)
            .where(Lead.id == lead_id, Lead.deleted_at.is_(None))
            .options(joinedload(Lead.activities))
        )
        result = await self.db.execute(query)
        return result.unique().scalar_one_or_none()

    async def search_global(
        self,
        query_str: str,
        limit: int = 20,
    ) -> list[Lead]:
        q = query_str.strip().lower()
        stmt = (
            select(Lead)
            .where(
                Lead.deleted_at.is_(None),
                or_(
                    func.lower(Lead.company_name).contains(q),
                    func.lower(Lead.client_contact_name).contains(q),
                    func.lower(Lead.assigned_rep).contains(q),
                    func.lower(Lead.description).contains(q),
                ),
            )
            .order_by(Lead.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def find_duplicates(
        self,
        company_name: Optional[str] = None,
        client_contact_name: Optional[str] = None,
        exclude_id: Optional[str] = None,
    ) -> list[Lead]:
        match_conditions = []
        if company_name:
            match_conditions.append(func.lower(Lead.company_name) == company_name.strip().lower())
        if client_contact_name:
            match_conditions.append(func.lower(Lead.client_contact_name) == client_contact_name.strip().lower())

        if not match_conditions:
            return []

        stmt = select(Lead).where(Lead.deleted_at.is_(None), or_(*match_conditions))
        if exclude_id:
            stmt = stmt.where(Lead.id != exclude_id)
        stmt = stmt.limit(5)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, data: dict) -> Lead:
        lead = Lead(id=str(uuid.uuid4()), **data)
        self.db.add(lead)
        await self.db.flush()
        return lead

    def _stamp_closure(self, lead: Lead, stage: str) -> None:
        """Set/clear Lead.closed_at for a stage write.

        A lead's stage can be changed through TWO different service paths —
        LeadService.change_stage (the dropdown / Kanban drag) and
        LeadService.update_lead (the drawer's own Stage field, which goes
        through the generic update() below) — so this rule lives in one
        place and is called from both, rather than being stamped in whichever
        path someone happened to remember.

        Re-closing under the other outcome (Won -> Lost, a correction)
        intentionally restarts the 20-day board window: the corrected outcome
        is the recent news worth showing. Reopening to a live stage clears it.
        """
        lead.closed_at = now_pkt() if stage in TERMINAL_STAGES else None

    async def update(self, lead: Lead, data: dict) -> Lead:
        for key, value in data.items():
            setattr(lead, key, value)
        # Only when this update actually carries a stage, and never when the
        # caller set closed_at explicitly (nothing does today, but silently
        # overwriting a caller's own value would be a nasty surprise).
        if "stage" in data and "closed_at" not in data:
            self._stamp_closure(lead, data["stage"])
        lead.updated_at = now_pkt()
        await self.db.flush()
        return lead

    async def soft_delete(self, lead: Lead) -> Lead:
        lead.deleted_at = now_pkt()
        lead.updated_at = now_pkt()
        await self.db.flush()
        return lead

    async def update_stage(self, lead: Lead, stage: str) -> Lead:
        lead.stage = stage
        lead.updated_at = now_pkt()
        self._stamp_closure(lead, stage)
        if stage == "Won":
            lead.is_locked_revenue = bool(lead.scope_document_data and lead.signed_contract_data)
        await self.db.flush()
        return lead

    def _apply_filters(self, query, search, stage, source, assigned_rep, date_from, date_to, overdue_only):
        if search:
            q = search.strip().lower()
            query = query.where(
                or_(
                    func.lower(Lead.company_name).contains(q),
                    func.lower(Lead.client_contact_name).contains(q),
                    func.lower(Lead.assigned_rep).contains(q),
                    func.lower(Lead.description).contains(q),
                )
            )
        if stage:
            query = query.where(Lead.stage == stage)
        if source:
            query = query.where(Lead.source == source)
        if assigned_rep:
            query = query.where(Lead.assigned_rep == assigned_rep)
        if date_from:
            query = query.where(Lead.date_received >= date_from)
        if date_to:
            query = query.where(Lead.date_received <= date_to)
        if overdue_only:
            today = now_pkt().date()
            query = query.where(
                and_(
                    Lead.follow_up_date.isnot(None),
                    Lead.follow_up_date < today,
                    Lead.stage.notin_(["Won", "Lost"]),
                )
            )
        return query
