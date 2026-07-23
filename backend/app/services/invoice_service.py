from typing import Optional
from fastapi import HTTPException, status

from app.models.invoice import Invoice
from app.repositories.invoice_repository import InvoiceRepository
from app.repositories.notification_repository import NotificationRepository
from app.services.invoice_pdf_service import generate_invoice_pdf_bytes, safe_invoice_filename

class InvoiceService:
    def __init__(self, invoice_repo: InvoiceRepository, notification_repo: Optional[NotificationRepository] = None, audit_repo = None):
        self.invoice_repo = invoice_repo
        self.notification_repo = notification_repo
        self.audit_repo = audit_repo

    async def _audit(self, actor: str, action: str, label: str, detail: Optional[str] = None) -> None:
        if self.audit_repo:
            await self.audit_repo.log(actor, action, "Invoice", label, detail)

    async def list_invoices(self, **kwargs) -> list[Invoice]:
        return await self.invoice_repo.find_all(**kwargs)

    async def get_invoice(self, invoice_id: str) -> Optional[Invoice]:
        return await self.invoice_repo.find_by_id(invoice_id)

    def _apply_paid_date(self, data: dict) -> None:
        """Paid Date only makes sense while status is Paid — clear it out
        whenever the invoice is (re)set to any other status, so an invoice
        bounced back from Paid doesn't keep showing a stale paid date."""
        if "status" in data and data["status"] != "Paid":
            data["paid_date"] = None

    def _apply_line_items(self, data: dict) -> None:
        """Recomputes `amount` (grand total) and the primary `project_id`
        from `line_items` whenever line items are part of the payload —
        never trust a client-sent total."""
        if "line_items" not in data:
            return
        items = data["line_items"] or []
        data["line_items"] = items
        data["amount"] = sum((item.get("qty", 1) or 1) * (item.get("unit_price", 0) or 0) for item in items)
        if not data.get("project_id"):
            first_with_project = next((i for i in items if i.get("project_id")), None)
            if first_with_project:
                data["project_id"] = first_with_project["project_id"]

    async def create_invoice(self, data: dict, user: str = "anonymous") -> Invoice:
        self._apply_paid_date(data)
        self._apply_line_items(data)
        data["created_by"] = user
        data["updated_by"] = user
        invoice = await self.invoice_repo.create(data)

        # Invoice notifications were removed per request — the Audit Trail
        # below still records creation/status changes for Finance/Owner.
        await self._audit(user, "Created", invoice.invoice_number, f"Client '{invoice.client}'")
        return invoice

    async def update_invoice(self, invoice_id: str, data: dict, user: str = "anonymous") -> Invoice:
        invoice = await self.invoice_repo.find_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")

        self._apply_paid_date(data)
        self._apply_line_items(data)
        old_status = invoice.status
        data["updated_by"] = user
        updated_invoice = await self.invoice_repo.update(invoice, data)

        new_status = updated_invoice.status
        if old_status != new_status:
            await self._audit(user, "Status Changed", updated_invoice.invoice_number, f"'{old_status}' → '{new_status}'")
        else:
            changed = sorted(k for k in data.keys() if k != "updated_by")
            await self._audit(user, "Updated", updated_invoice.invoice_number, f"Fields updated: {', '.join(changed)}" if changed else None)

        return updated_invoice

    async def delete_invoice(self, invoice_id: str, user: str = "anonymous") -> None:
        invoice = await self.invoice_repo.find_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
        await self._audit(user, "Deleted", invoice.invoice_number)
        await self.invoice_repo.soft_delete(invoice)

    def generate_invoice_pdf(self, invoice: Invoice) -> tuple[bytes, str]:
        pdf_bytes = generate_invoice_pdf_bytes(invoice)
        filename = safe_invoice_filename(invoice.invoice_number)
        return pdf_bytes, filename
