import asyncio
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user, get_finance_user
from app.repositories.invoice_repository import InvoiceRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.services.invoice_service import InvoiceService
from app.schemas.invoice import InvoiceCreate, InvoiceUpdate, InvoiceResponse

router = APIRouter(prefix="/api/finance/invoices", tags=["Invoices"])

def get_invoice_service(db: AsyncSession = Depends(get_db)) -> InvoiceService:
    return InvoiceService(
        invoice_repo=InvoiceRepository(db),
        notification_repo=NotificationRepository(db),
        audit_repo=AuditLogRepository(db),
    )

def _map_invoice_response(inv) -> InvoiceResponse:
    resp = InvoiceResponse.model_validate(inv)
    resp.project_name = inv.project.name if inv.project else None
    return resp

@router.get("", response_model=list[InvoiceResponse])
async def list_invoices(
    search: Optional[str] = None,
    status: Optional[str] = None,
    currency: Optional[str] = None,
    project_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 100,
    service: InvoiceService = Depends(get_invoice_service),
    current_user: dict = Depends(get_current_user),
):
    invoices = await service.list_invoices(
        search=search, status=status, currency=currency, project_id=project_id,
        date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir, page=page, page_size=page_size
    )
    return [_map_invoice_response(i) for i in invoices]

@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    service: InvoiceService = Depends(get_invoice_service),
    current_user: dict = Depends(get_current_user),
):
    inv = await service.get_invoice(invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    return _map_invoice_response(inv)

@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    service: InvoiceService = Depends(get_invoice_service),
):
    inv = await service.get_invoice(invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
    # reportlab PDF generation is synchronous, CPU-bound work — run it off
    # the event loop so it doesn't stall other requests while it builds.
    pdf_bytes, filename = await asyncio.get_event_loop().run_in_executor(
        None, service.generate_invoice_pdf, inv
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def create_invoice(
    body: InvoiceCreate,
    service: InvoiceService = Depends(get_invoice_service),
    current_user: dict = Depends(get_finance_user),
):
    inv = await service.create_invoice(body.model_dump(), user=current_user.get("user_id", "anonymous"))
    return _map_invoice_response(inv)

@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    service: InvoiceService = Depends(get_invoice_service),
    current_user: dict = Depends(get_finance_user),
):
    inv = await service.update_invoice(
        invoice_id,
        body.model_dump(exclude_none=True),
        user=current_user.get("user_id", "anonymous")
    )
    return _map_invoice_response(inv)

@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(
    invoice_id: str,
    service: InvoiceService = Depends(get_invoice_service),
    current_user: dict = Depends(get_finance_user),
):
    await service.delete_invoice(invoice_id, user=current_user.get("user_id", "anonymous"))
