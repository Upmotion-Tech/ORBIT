from pydantic import BaseModel

class FinanceStatsResponse(BaseModel):
    total_outstanding_usd: float
    total_paid_usd: float
    monthly_revenue_usd: float
    monthly_expenses_usd: float
    pending_expenses_usd: float
    payroll_cost_usd: float
    upcoming_milestones_usd: float

    model_config = {"from_attributes": True}
