from pydantic import BaseModel, Field


class ExpenseCategoryBudgetUpdate(BaseModel):
    monthly_budget_usd: float = Field(..., ge=0)


class ExpenseCategoryBudgetResponse(BaseModel):
    category: str
    budget_usd: float
    actual_usd: float

    model_config = {"from_attributes": True}
