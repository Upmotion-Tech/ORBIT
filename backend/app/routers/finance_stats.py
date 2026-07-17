from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.services.finance_dashboard_service import FinanceDashboardService
from app.schemas.finance_stats import FinanceStatsResponse

router = APIRouter(prefix="/api/finance/stats", tags=["Stats"])

@router.get("", response_model=FinanceStatsResponse)
async def get_finance_stats(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    service = FinanceDashboardService(db)
    stats = await service.get_stats()
    return stats
