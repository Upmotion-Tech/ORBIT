from typing import Optional
from datetime import date
from fastapi import HTTPException, status

from app.repositories.salary_slip_repository import SalarySlipRepository
from app.repositories.employee_repository import EmployeeRepository
from app.core.time import now_pkt
from app.schemas.tax_certificate import FiscalYearOption, MonthlyTaxSummaryLine, MonthlyTaxSummaryResponse


class TaxCertificateService:
    """Every figure here is derived fresh from existing SalarySlip rows —
    there is no separate 'tax certificate' table. A Pakistani fiscal year
    (FY) runs July 1 -> June 30 and is only considered closed, and therefore
    only offered for certificate generation, once today's date is past that
    June 30 (see _latest_completed_fy_end_year)."""

    def __init__(self, slip_repo: SalarySlipRepository, employee_repo: EmployeeRepository):
        self.slip_repo = slip_repo
        self.employee_repo = employee_repo

    # ---- Fiscal year math ----

    def _latest_completed_fy_end_year(self) -> int:
        today = now_pkt().date()
        return today.year if today.month >= 7 else today.year - 1

    def _current_fy_end_year(self) -> int:
        return self._latest_completed_fy_end_year() + 1

    def _fy_bounds(self, end_year: int) -> tuple[str, str]:
        return f"{end_year - 1}-07", f"{end_year}-06"

    def _fy_label(self, end_year: int) -> str:
        return f"{end_year - 1}-{end_year}"

    def _start_fy_end_year(self, start_date: date) -> int:
        return start_date.year + 1 if start_date.month >= 7 else start_date.year

    def _parse_fy_label(self, fiscal_year: str) -> tuple[int, str, str]:
        try:
            start_year_s, end_year_s = fiscal_year.split("-")
            start_year, end_year = int(start_year_s), int(end_year_s)
            if end_year != start_year + 1:
                raise ValueError
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid fiscal year format — expected e.g. '2025-2026'.",
            )
        start_m, end_m = self._fy_bounds(end_year)
        return end_year, start_m, end_m

    def _assert_fy_completed(self, end_year: int) -> None:
        if end_year > self._latest_completed_fy_end_year():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This fiscal year hasn't ended yet — a tax certificate becomes available the day after it closes on June 30.",
            )

    def _years_range(self, start_end_year: int, latest_end_year: int) -> list[FiscalYearOption]:
        years = []
        for end_year in range(start_end_year, latest_end_year + 1):
            start_m, end_m = self._fy_bounds(end_year)
            years.append(FiscalYearOption(label=self._fy_label(end_year), start_month=start_m, end_month=end_m))
        return list(reversed(years))

    # ---- Fiscal year option lists ----

    async def get_employee_fiscal_years(self, employee_id: str) -> list[FiscalYearOption]:
        """Only fiscal years that have both (a) actually closed and (b)
        started on or after the employee's own join date — someone hired in
        October 2025 has no business being offered a certificate for a
        fiscal year that ended before they existed."""
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")
        latest = self._latest_completed_fy_end_year()
        start = self._start_fy_end_year(employee.start_date)
        if start > latest:
            return []
        return self._years_range(start, latest)

    async def get_company_fiscal_years(self) -> list[FiscalYearOption]:
        earliest_start = await self.employee_repo.find_earliest_start_date()
        if not earliest_start:
            return []
        latest = self._latest_completed_fy_end_year()
        start = self._start_fy_end_year(earliest_start)
        if start > latest:
            return []
        return self._years_range(start, latest)

    async def get_summary_fiscal_year_options(self) -> list[FiscalYearOption]:
        """For Setup's monthly tax summary picker — includes the current,
        still-open fiscal year too (that's the whole point: watching the
        running total build up before the year even closes)."""
        earliest_start = await self.employee_repo.find_earliest_start_date()
        current = self._current_fy_end_year()
        start = self._start_fy_end_year(earliest_start) if earliest_start else current
        if start > current:
            start = current
        return self._years_range(start, current)

    # ---- Certificate data assembly (consumed by tax_certificate_pdf_service) ----

    async def build_employee_certificate(self, employee_id: str, fiscal_year: str) -> dict:
        end_year, start_m, end_m = self._parse_fy_label(fiscal_year)
        self._assert_fy_completed(end_year)
        employee = await self.employee_repo.find_by_id(employee_id)
        if not employee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found.")

        all_slips = await self.slip_repo.find_all(employee_id=employee_id, sort_by="month", sort_dir="asc", page_size=10000)
        months = [s for s in all_slips if start_m <= s.month <= end_m]
        if not months:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No salary records found for this employee in the selected fiscal year.",
            )
        return {
            "fiscal_year": fiscal_year,
            "start_month": start_m,
            "end_month": end_m,
            "employee": employee,
            "months": months,
            "total_gross": sum(s.gross_salary for s in months),
            "total_tax": sum(s.tax for s in months),
            "total_net": sum(s.net_salary for s in months),
        }

    async def build_company_certificate(self, fiscal_year: str) -> dict:
        end_year, start_m, end_m = self._parse_fy_label(fiscal_year)
        self._assert_fy_completed(end_year)

        all_slips = await self.slip_repo.find_all(sort_by="month", sort_dir="asc", page_size=100000)
        in_range = [s for s in all_slips if start_m <= s.month <= end_m]
        if not in_range:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No salary records found company-wide in the selected fiscal year.",
            )

        by_employee: dict[str, dict] = {}
        for s in in_range:
            emp = s.employee
            if not emp:
                continue
            row = by_employee.setdefault(emp.id, {"employee": emp, "total_gross": 0.0, "total_tax": 0.0, "total_net": 0.0})
            row["total_gross"] += s.gross_salary
            row["total_tax"] += s.tax
            row["total_net"] += s.net_salary

        lines = sorted(by_employee.values(), key=lambda r: r["employee"].name)
        return {
            "fiscal_year": fiscal_year,
            "start_month": start_m,
            "end_month": end_m,
            "lines": lines,
            "total_gross": sum(r["total_gross"] for r in lines),
            "total_tax": sum(r["total_tax"] for r in lines),
            "total_net": sum(r["total_net"] for r in lines),
        }

    # ---- Setup > Tax Slabs monthly deduction summary ----

    async def get_monthly_summary(self, fiscal_year: Optional[str] = None) -> MonthlyTaxSummaryResponse:
        if fiscal_year:
            _, start_m, end_m = self._parse_fy_label(fiscal_year)
            label = fiscal_year
        else:
            end_year = self._current_fy_end_year()
            start_m, end_m = self._fy_bounds(end_year)
            label = self._fy_label(end_year)

        all_months = []
        y, m = (int(x) for x in start_m.split("-"))
        cursor = f"{y:04d}-{m:02d}"
        while cursor <= end_m:
            all_months.append(cursor)
            m += 1
            if m > 12:
                m = 1
                y += 1
            cursor = f"{y:04d}-{m:02d}"

        all_slips = await self.slip_repo.find_all(page_size=100000)
        by_month: dict[str, list] = {}
        for s in all_slips:
            if start_m <= s.month <= end_m:
                by_month.setdefault(s.month, []).append(s)

        lines = [
            MonthlyTaxSummaryLine(
                month=month,
                employees_paid=len(by_month.get(month, [])),
                total_gross=sum(s.gross_salary for s in by_month.get(month, [])),
                total_tax=sum(s.tax for s in by_month.get(month, [])),
            )
            for month in all_months
        ]
        return MonthlyTaxSummaryResponse(
            fiscal_year=label,
            months=lines,
            total_gross=sum(l.total_gross for l in lines),
            total_tax=sum(l.total_tax for l in lines),
        )
