from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_finance_user, get_owner_department_user
from app.repositories.tax_slab_repository import TaxSlabRepository
from app.services.tax_slab_service import TaxSlabService
from app.schemas.tax_slab import TaxSlabCreate, TaxSlabUpdate, TaxSlabResponse

router = APIRouter(prefix="/api/finance/tax-slabs", tags=["Tax Slabs"])


def get_tax_slab_service(db: AsyncSession = Depends(get_db)) -> TaxSlabService:
    return TaxSlabService(TaxSlabRepository(db))


@router.get("", response_model=list[TaxSlabResponse])
async def list_tax_slabs(
    service: TaxSlabService = Depends(get_tax_slab_service),
    current_user: dict = Depends(get_finance_user),
):
    return await service.list_slabs()


@router.post("", response_model=TaxSlabResponse, status_code=status.HTTP_201_CREATED)
async def create_tax_slab(
    body: TaxSlabCreate,
    service: TaxSlabService = Depends(get_tax_slab_service),
    current_user: dict = Depends(get_owner_department_user),
):
    data = body.model_dump()
    data["created_by_id"] = current_user.get("user_id")
    data["updated_by_id"] = current_user.get("user_id")
    return await service.create_slab(data)


@router.put("/{slab_id}", response_model=TaxSlabResponse)
async def update_tax_slab(
    slab_id: str,
    body: TaxSlabUpdate,
    service: TaxSlabService = Depends(get_tax_slab_service),
    current_user: dict = Depends(get_owner_department_user),
):
    data = body.model_dump(exclude_unset=True)
    data["updated_by_id"] = current_user.get("user_id")
    return await service.update_slab(slab_id, data)


@router.delete("/{slab_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tax_slab(
    slab_id: str,
    service: TaxSlabService = Depends(get_tax_slab_service),
    current_user: dict = Depends(get_owner_department_user),
):
    await service.delete_slab(slab_id)
