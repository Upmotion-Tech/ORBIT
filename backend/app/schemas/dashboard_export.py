from typing import Optional
from pydantic import BaseModel


class DelayedProjectRow(BaseModel):
    name: str
    client: Optional[str] = None
    days_overdue: Optional[str] = None


class ProfitabilityRow(BaseModel):
    name: str
    revenue: str
    cost: str
    margin: str


class UtilizationRow(BaseModel):
    name: str
    pct: str


class CategoryBudgetRow(BaseModel):
    category: str
    actual: str
    budget: str


class RevenueSummary(BaseModel):
    locked: str
    invoiced: str
    collected: str
    expected: str


class CashPosition(BaseModel):
    receivables: str
    payroll_month: str
    total_cash_out_month: str
    net_position: str


class DashboardExportRequest(BaseModel):
    currency_label: str
    fx_note: str
    period_label: str
    revenue: RevenueSummary
    cash_position: CashPosition
    expenses_month: str
    delayed_projects: list[DelayedProjectRow] = []
    profitability: list[ProfitabilityRow] = []
    utilization: list[UtilizationRow] = []
    category_budgets: list[CategoryBudgetRow] = []
