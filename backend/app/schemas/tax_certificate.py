from typing import Optional
from pydantic import BaseModel


class FiscalYearOption(BaseModel):
    """A Pakistani fiscal year (July 1 - June 30) offered for certificate
    generation, labeled the way the user picks it (e.g. "2025-2026") rather
    than FBR's single-year "Tax Year 2026" convention — the PDF itself shows
    both."""
    label: str
    start_month: str
    end_month: str


class MonthlyTaxSummaryLine(BaseModel):
    month: str
    employees_paid: int
    total_gross: float
    total_tax: float


class MonthlyTaxSummaryResponse(BaseModel):
    fiscal_year: str
    months: list[MonthlyTaxSummaryLine]
    total_gross: float
    total_tax: float
