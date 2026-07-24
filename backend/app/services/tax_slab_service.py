from typing import Optional
from fastapi import HTTPException, status

from app.models.tax_slab import TaxSlab
from app.repositories.tax_slab_repository import TaxSlabRepository


class TaxSlabService:
    def __init__(self, slab_repo: TaxSlabRepository):
        self.slab_repo = slab_repo

    async def list_slabs(self) -> list[TaxSlab]:
        return await self.slab_repo.find_all()

    async def calculate_monthly_income_tax(self, monthly_gross_salary: float) -> float:
        """Annualizes the monthly gross, finds the matching active slab, and
        returns the monthly tax withholding — the same mechanism used
        everywhere ORBIT explains Pakistani salary tax: annualize -> match
        slab -> fixed + percentage% of the amount over the slab's minimum ->
        divide by 12. Returns 0 if no active slab matches (e.g. no slabs
        configured yet, or the salary falls in an uncovered gap)."""
        annual_salary = monthly_gross_salary * 12
        slab = await self.slab_repo.find_active_matching_salary(annual_salary)
        if not slab:
            return 0.0
        annual_tax = slab.fixed_tax + (slab.tax_percentage / 100.0) * (annual_salary - slab.min_salary)
        return round(annual_tax / 12.0, 2)

    async def _validate_no_overlap(self, min_salary: float, max_salary: Optional[float], exclude_id: Optional[str] = None) -> None:
        overlaps = await self.slab_repo.find_overlapping_active(min_salary, max_salary, exclude_id=exclude_id)
        if overlaps:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="This range overlaps an existing active tax slab.",
            )
        if max_salary is None:
            existing_open_ended = await self.slab_repo.count_open_ended_active(exclude_id=exclude_id)
            if existing_open_ended:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="There's already an open-ended (no maximum) active tax slab.",
                )

    async def create_slab(self, data: dict) -> TaxSlab:
        if data.get("active", True):
            await self._validate_no_overlap(data["min_salary"], data.get("max_salary"))
        return await self.slab_repo.create(data)

    async def update_slab(self, slab_id: str, data: dict) -> TaxSlab:
        slab = await self.slab_repo.find_by_id(slab_id)
        if not slab:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax slab not found.")
        will_be_active = data.get("active", slab.active)
        if will_be_active:
            min_salary = data.get("min_salary", slab.min_salary)
            max_salary = data["max_salary"] if "max_salary" in data else slab.max_salary
            await self._validate_no_overlap(min_salary, max_salary, exclude_id=slab_id)
        return await self.slab_repo.update(slab, data)

    async def delete_slab(self, slab_id: str) -> None:
        slab = await self.slab_repo.find_by_id(slab_id)
        if not slab:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax slab not found.")
        await self.slab_repo.delete(slab)
