from typing import Optional
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_finance_user, get_owner_department_user
from app.repositories.salary_slip_repository import SalarySlipRepository
from app.repositories.employee_repository import EmployeeRepository
from app.services.tax_certificate_service import TaxCertificateService
from app.services.tax_certificate_pdf_service import (
    generate_employee_tax_certificate_pdf_bytes,
    generate_company_tax_certificate_pdf_bytes,
    safe_employee_certificate_filename,
    safe_company_certificate_filename,
)
from app.schemas.tax_certificate import FiscalYearOption, MonthlyTaxSummaryResponse

router = APIRouter(prefix="/api/finance/tax-certificates", tags=["Tax Certificates"])


def get_tax_certificate_service(db: AsyncSession = Depends(get_db)) -> TaxCertificateService:
    return TaxCertificateService(SalarySlipRepository(db), EmployeeRepository(db))


@router.get("/years/me", response_model=list[FiscalYearOption])
async def get_my_fiscal_years(
    service: TaxCertificateService = Depends(get_tax_certificate_service),
    current_user: dict = Depends(get_current_user),
):
    return await service.get_employee_fiscal_years(current_user.get("user_id"))


@router.get("/me/pdf")
async def get_my_tax_certificate_pdf(
    fiscal_year: str,
    service: TaxCertificateService = Depends(get_tax_certificate_service),
    current_user: dict = Depends(get_current_user),
):
    data = await service.build_employee_certificate(current_user.get("user_id"), fiscal_year)
    pdf_bytes = generate_employee_tax_certificate_pdf_bytes(data)
    filename = safe_employee_certificate_filename(data["employee"].name, fiscal_year)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/years/company", response_model=list[FiscalYearOption])
async def get_company_fiscal_years(
    service: TaxCertificateService = Depends(get_tax_certificate_service),
    current_user: dict = Depends(get_owner_department_user),
):
    return await service.get_company_fiscal_years()


@router.get("/company/pdf")
async def get_company_tax_certificate_pdf(
    fiscal_year: str,
    service: TaxCertificateService = Depends(get_tax_certificate_service),
    current_user: dict = Depends(get_owner_department_user),
):
    data = await service.build_company_certificate(fiscal_year)
    pdf_bytes = generate_company_tax_certificate_pdf_bytes(data)
    filename = safe_company_certificate_filename(fiscal_year)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/summary-years", response_model=list[FiscalYearOption])
async def get_summary_fiscal_years(
    service: TaxCertificateService = Depends(get_tax_certificate_service),
    current_user: dict = Depends(get_finance_user),
):
    return await service.get_summary_fiscal_year_options()


@router.get("/monthly-summary", response_model=MonthlyTaxSummaryResponse)
async def get_monthly_tax_summary(
    fiscal_year: Optional[str] = None,
    service: TaxCertificateService = Depends(get_tax_certificate_service),
    current_user: dict = Depends(get_finance_user),
):
    return await service.get_monthly_summary(fiscal_year)
