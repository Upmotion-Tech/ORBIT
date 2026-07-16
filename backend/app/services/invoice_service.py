from datetime import date
from io import BytesIO
from typing import Optional
from fastapi import HTTPException, status
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from app.models.invoice import Invoice
from app.repositories.invoice_repository import InvoiceRepository
from app.repositories.notification_repository import NotificationRepository
from app.schemas.invoice import InvoiceCreate, InvoiceUpdate, InvoiceResponse

class InvoiceService:
    def __init__(self, invoice_repo: InvoiceRepository, notification_repo: Optional[NotificationRepository] = None):
        self.invoice_repo = invoice_repo
        self.notification_repo = notification_repo

    async def list_invoices(self, **kwargs) -> list[Invoice]:
        return await self.invoice_repo.find_all(**kwargs)

    async def get_invoice(self, invoice_id: str) -> Optional[Invoice]:
        return await self.invoice_repo.find_by_id(invoice_id)

    async def create_invoice(self, data: dict, user: str = "anonymous") -> Invoice:
        data["created_by"] = user
        data["updated_by"] = user
        invoice = await self.invoice_repo.create(data)

        if self.notification_repo:
            await self.notification_repo.create(
                user_id="financehead",
                notif_type="Invoice Created",
                title="New Invoice Draft Created",
                message=f"Invoice for client {invoice.client} was created by {user}."
            )
            await self.notification_repo.create(
                user_id="owner",
                notif_type="Invoice Created",
                title="New Invoice Draft Created",
                message=f"Invoice for client {invoice.client} was created by {user}."
            )
        return invoice

    async def update_invoice(self, invoice_id: str, data: dict, user: str = "anonymous") -> Invoice:
        invoice = await self.invoice_repo.find_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")

        old_status = invoice.status
        data["updated_by"] = user
        updated_invoice = await self.invoice_repo.update(invoice, data)

        # Trigger notification if status changed
        new_status = updated_invoice.status
        if old_status != new_status and self.notification_repo:
            notif_type = f"Invoice {new_status}"
            title = f"Invoice Status Changed to {new_status}"
            message = f"Invoice #{invoice.id[:8].upper()} for client {invoice.client} is now marked as {new_status}."
            
            # Send to both finance and owner
            await self.notification_repo.create(user_id="financehead", notif_type=notif_type, title=title, message=message)
            await self.notification_repo.create(user_id="owner", notif_type=notif_type, title=title, message=message)

        return updated_invoice

    async def delete_invoice(self, invoice_id: str) -> None:
        invoice = await self.invoice_repo.find_by_id(invoice_id)
        if not invoice:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
        await self.invoice_repo.soft_delete(invoice)

    def generate_invoice_pdf(self, invoice: Invoice) -> BytesIO:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
        story = []
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'InvoiceTitle',
            parent=styles['Heading1'],
            fontSize=22,
            leading=26,
            textColor=colors.HexColor('#2A6FDB')
        )
        normal_style = styles['Normal']
        bold_style = ParagraphStyle('Bold', parent=normal_style, fontName='Helvetica-Bold')
        
        story.append(Paragraph(f"INVOICE #{invoice.id[:8].upper()}", title_style))
        story.append(Spacer(1, 15))
        
        # Meta Table
        meta_data = [
            [Paragraph("<b>Company:</b>", normal_style), Paragraph("Upmotion ORBIT", normal_style),
             Paragraph("<b>Issue Date:</b>", normal_style), Paragraph(str(invoice.issue_date), normal_style)],
            [Paragraph("<b>Client:</b>", normal_style), Paragraph(invoice.client, normal_style),
             Paragraph("<b>Due Date:</b>", normal_style), Paragraph(str(invoice.due_date), normal_style)],
            [Paragraph("<b>Project:</b>", normal_style), Paragraph(invoice.project.name if invoice.project else "N/A", normal_style),
             Paragraph("<b>Status:</b>", normal_style), Paragraph(invoice.status, normal_style)]
        ]
        t = Table(meta_data, colWidths=[80, 200, 80, 150])
        t.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 25))
        
        # Summary Table
        summary_data = [
            [Paragraph("<b>Description</b>", bold_style), Paragraph("<b>Amount</b>", bold_style)],
            [Paragraph(f"Invoice for project {invoice.project.name if invoice.project else 'N/A'} ({invoice.invoice_type})", normal_style),
             Paragraph(f"{invoice.currency} {invoice.amount:,.2f}", normal_style)],
            [Paragraph("<b>Total Due</b>", bold_style), Paragraph(f"<b>{invoice.currency} {invoice.amount:,.2f}</b>", bold_style)]
        ]
        st = Table(summary_data, colWidths=[380, 130])
        st.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,0), 1, colors.HexColor('#2A6FDB')),
            ('LINEABOVE', (0,2), (-1,2), 1, colors.HexColor('#2A6FDB')),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ]))
        story.append(st)
        story.append(Spacer(1, 20))
        
        if invoice.notes:
            story.append(Paragraph("<b>Notes:</b>", normal_style))
            story.append(Spacer(1, 5))
            story.append(Paragraph(invoice.notes, normal_style))
            
        doc.build(story)
        buffer.seek(0)
        return buffer
