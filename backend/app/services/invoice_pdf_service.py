"""
Generates the invoice PDF directly with reportlab — no Word/LibreOffice/any
external binary involved, so it runs identically on the Render (Linux)
production server as it does locally. This replaces the previous approach
(filling app/templates/invoice_template.docx with python-docx, then
converting to PDF via docx2pdf/Word COM automation), which only ever worked
on a Windows machine with Microsoft Word installed and produced a crashed/
corrupt download in production.

Letterhead content (address, logo, approval signature/stamp) mirrors the
original Invoice Template.docx field-for-field — extracted directly from
that file's XML/embedded images, not guessed. An earlier version of this
generator used ORBIT's own internal-tool tagline ("Operational Revenue &
Business Intelligence") as if it were company letterhead text, and used a
square icon-badge logo instead of the real wordmark embedded in the actual
template — both fixed here.
"""
import io
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_RIGHT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from app.models.invoice import Invoice

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "upmotion_logo.png")
STAMP_PATH = os.path.join(ASSETS_DIR, "upmotion_stamp.png")

COMPANY_ADDRESS = "29-C Main Gulberg, Lahore Pakistan"
APPROVER_NAME = "Unas Zubair"

CURRENCY_SYMBOL = {"USD": "$", "PKR": "₨"}
CURRENCY_WORDS = {"USD": "US Dollars", "PKR": "Pakistani Rupees"}

BRAND = colors.HexColor("#4F46E5")
BRAND_LIGHT = colors.HexColor("#EEF2FF")
RULE = colors.HexColor("#E5E7EB")
MUTED = colors.HexColor("#666666")

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
         "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _int_to_words(n: int) -> str:
    if n == 0:
        return "Zero"

    def three_digits(num: int) -> str:
        parts = []
        if num >= 100:
            parts.append(_ONES[num // 100] + " Hundred")
            num %= 100
        if num >= 20:
            parts.append(_TENS[num // 10] + (f"-{_ONES[num % 10]}" if num % 10 else ""))
        elif num > 0:
            parts.append(_ONES[num])
        return " ".join(parts)

    scales = [(1_000_000_000, "Billion"), (1_000_000, "Million"), (1_000, "Thousand")]
    words = []
    remaining = n
    for value, name in scales:
        if remaining >= value:
            words.append(f"{three_digits(remaining // value)} {name}")
            remaining %= value
    if remaining > 0:
        words.append(three_digits(remaining))
    return " ".join(words)


def amount_in_words(amount: float, currency: str) -> str:
    whole = int(amount)
    cents = round((amount - whole) * 100)
    currency_name = CURRENCY_WORDS.get(currency, currency)
    text = f"{_int_to_words(whole)} {currency_name}"
    if cents:
        text += f" and {_int_to_words(cents)} {'Cent' if cents == 1 else 'Cents'}"
    return text + " Only"


def _fmt_money(n: float) -> str:
    return f"{n:,.2f}" if n % 1 else f"{n:,.0f}"


def generate_invoice_pdf_bytes(invoice: Invoice) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        # Without these, reportlab defaults every PDF's Title/Author metadata
        # to the literal string "anonymous" — that's what a PDF viewer's tab
        # title or file-properties panel shows if it's never set explicitly.
        title=f"Invoice {invoice.invoice_number}" if invoice.invoice_number else "Invoice",
        author="Upmotion Tech",
    )
    styles = getSampleStyleSheet()
    company_style = ParagraphStyle("ORBITCompany", parent=styles["Title"], fontSize=18, spaceAfter=0)
    tagline_style = ParagraphStyle("ORBITTagline", parent=styles["Normal"], textColor=MUTED, fontSize=9, spaceAfter=0)
    label_style = ParagraphStyle("ORBITLabel", parent=styles["Normal"], fontSize=10, textColor=MUTED, spaceAfter=2)
    value_style = ParagraphStyle("ORBITValue", parent=styles["Normal"], fontSize=11, spaceAfter=8)
    value_right_style = ParagraphStyle("ORBITValueRight", parent=value_style, alignment=TA_RIGHT)
    label_right_style = ParagraphStyle("ORBITLabelRight", parent=label_style, alignment=TA_RIGHT)
    section_style = ParagraphStyle("ORBITSection", parent=styles["Heading2"], fontSize=11, spaceBefore=14, spaceAfter=6, textColor=BRAND)
    body_style = ParagraphStyle("ORBITBody", parent=styles["Normal"], fontSize=10)

    story = []

    # ---- Letterhead ----
    if os.path.exists(LOGO_PATH):
        # Real wordmark logo (2.99:1 aspect ratio) — sized to keep that ratio
        # rather than the old square-icon crop this used to show.
        logo = Image(LOGO_PATH, width=1.6 * inch, height=1.6 / 2.9924 * inch)
        story.append(logo)
    else:
        story.append(Paragraph("Upmotion Tech", company_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(COMPANY_ADDRESS, tagline_style))
    if invoice.registration_number:
        story.append(Paragraph(f"Registration Number: {invoice.registration_number}", tagline_style))
    if invoice.ntn:
        story.append(Paragraph(f"NTN: {invoice.ntn}", tagline_style))
    story.append(Spacer(1, 18))

    # ---- Issued To / Invoice No / Date ----
    date_str = invoice.issue_date.strftime("%d / %m / %Y")
    if invoice.status == "Paid" and invoice.paid_date:
        date_str += f"    (Paid {invoice.paid_date.strftime('%d / %m / %Y')})"
    left_col = [Paragraph("ISSUED TO", label_style), Paragraph(invoice.client, value_style)]
    right_col = [
        Paragraph("INVOICE NO", label_right_style), Paragraph(invoice.invoice_number, value_right_style),
        Paragraph("DATE", label_right_style), Paragraph(date_str, value_right_style),
    ]
    info_table = Table([[left_col, right_col]], colWidths=[3.2 * inch, 3.2 * inch])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1, RULE),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 16))

    # ---- Line items ----
    sym = CURRENCY_SYMBOL.get(invoice.currency, invoice.currency + " ")
    items = invoice.line_items or []
    if not items:
        items = [{"description": invoice.invoice_type or "Services rendered", "qty": 1, "unit_price": invoice.amount}]

    rows = [["Description", "Qty", "Unit Price", "Total"]]
    grand_total = 0.0
    for item in items:
        qty = item.get("qty", 1) or 1
        unit_price = item.get("unit_price", 0) or 0
        line_total = qty * unit_price
        grand_total += line_total
        rows.append([item.get("description", ""), _fmt_money(qty), f"{sym}{_fmt_money(unit_price)}", f"{sym}{_fmt_money(line_total)}"])
    rows.append(["", "", "TOTAL", f"{sym} {_fmt_money(grand_total)}"])

    items_table = Table(rows, colWidths=[3.2 * inch, 0.8 * inch, 1.2 * inch, 1.2 * inch])
    items_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, RULE),
        ("LINEABOVE", (0, -1), (-1, -1), 1, BRAND),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 10))
    story.append(Paragraph(f"<b>In Words:</b> {amount_in_words(grand_total, invoice.currency)}", body_style))

    # ---- Notes ----
    if invoice.notes:
        story.append(Paragraph("Notes", section_style))
        story.append(Paragraph(invoice.notes, body_style))

    # ---- Approval signature ----
    story.append(Spacer(1, 16))
    approval_text = [
        Paragraph("Approved by:", label_style),
        Paragraph(APPROVER_NAME, value_style),
        Paragraph("Upmotion Tech", body_style),
    ]
    if os.path.exists(STAMP_PATH):
        stamp = Image(STAMP_PATH, width=0.9 * inch, height=0.9 / 1.1818 * inch)
        approval_row = Table([[approval_text, stamp]], colWidths=[4.4 * inch, 1.2 * inch])
        approval_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.append(approval_row)
    else:
        story.extend(approval_text)

    # ---- Bank details ----
    if any([invoice.bank_account_name, invoice.bank_account_number, invoice.bank_iban, invoice.bank_name]):
        story.append(Paragraph("Bank Details", section_style))
        bank_rows = []
        if invoice.bank_account_name:
            bank_rows.append(["Account Name:", invoice.bank_account_name])
        if invoice.bank_account_number:
            bank_rows.append(["Account Number:", invoice.bank_account_number])
        if invoice.bank_iban:
            bank_rows.append(["IBAN Number:", invoice.bank_iban])
        if invoice.bank_name:
            bank_rows.append(["Bank Name:", invoice.bank_name])
        bank_table = Table(bank_rows, colWidths=[1.6 * inch, 4 * inch])
        bank_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(bank_table)

    doc.build(story)
    return buf.getvalue()


def safe_invoice_filename(invoice_number: str) -> str:
    cleaned = "".join(c for c in invoice_number if c.isalnum() or c in ("-", "_"))
    return f"{cleaned or 'invoice'}.pdf"
