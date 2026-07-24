"""Generates Employee and Company tax certificates directly with reportlab,
mirroring invoice_pdf_service.py / salary_slip_pdf_service.py exactly (no
Word/LibreOffice/external binary — runs identically on Render as locally).

Modeled on the standard Pakistani employer-issued certificate format: a
"Certificate of Deduction of Income Tax" under Section 149 of the Income Tax
Ordinance, 2001 for an individual employee, and an "Annual Statement of Tax
Deducted from Salaries" (the company-wide equivalent of the Section 165
withholding statement employers file with FBR) for the company-wide one.
This is a placeholder layout until the user supplies their exact template —
company letterhead/address/approver mirror the existing invoice/salary-slip
letterhead constants so all three stay visually consistent until then.
"""
import io
import os
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from app.core.time import now_pkt

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "upmotion_logo.png")
STAMP_PATH = os.path.join(ASSETS_DIR, "upmotion_stamp.png")

COMPANY_NAME = "Upmotion Tech"
COMPANY_ADDRESS = "29-C Main Gulberg, Lahore Pakistan"
# Company's own NTN with FBR — blank until the user supplies it; the line is
# simply omitted from the letterhead while empty (same convention Invoice
# uses for its own optional ntn/registration_number fields).
COMPANY_NTN = ""
APPROVER_NAME = "Unas Zubair"

BRAND = colors.HexColor("#4F46E5")
BRAND_LIGHT = colors.HexColor("#EEF2FF")
RULE = colors.HexColor("#E5E7EB")
MUTED = colors.HexColor("#666666")

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _fmt_money(n: float) -> str:
    return f"Rs. {n:,.2f}" if n % 1 else f"Rs. {n:,.0f}"


def _month_label(month: str) -> str:
    try:
        year, m = month.split("-")
        return f"{MONTH_NAMES[int(m) - 1]} {year}"
    except (ValueError, IndexError):
        return month


def _fy_period_label(fiscal_year: str) -> str:
    try:
        start_year, end_year = fiscal_year.split("-")
        return f"July 01, {start_year} to June 30, {end_year}"
    except ValueError:
        return fiscal_year


def _tax_year_label(fiscal_year: str) -> str:
    """FBR names a fiscal year after the calendar year it ends in — July
    2025-June 2026 is "Tax Year 2026". Shown alongside the user's own
    "2025-2026" label rather than instead of it."""
    try:
        _, end_year = fiscal_year.split("-")
        return f"Tax Year {end_year}"
    except ValueError:
        return fiscal_year


def _letterhead_story(styles) -> list:
    company_style = ParagraphStyle("TCCompany", parent=styles["Title"], fontSize=18, spaceAfter=0)
    tagline_style = ParagraphStyle("TCTagline", parent=styles["Normal"], textColor=MUTED, fontSize=9, spaceAfter=0)
    story = []
    if os.path.exists(LOGO_PATH):
        story.append(Image(LOGO_PATH, width=1.6 * inch, height=1.6 / 2.9924 * inch))
    else:
        story.append(Paragraph(COMPANY_NAME, company_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(COMPANY_ADDRESS, tagline_style))
    if COMPANY_NTN:
        story.append(Paragraph(f"NTN: {COMPANY_NTN}", tagline_style))
    return story


def _signature_block(styles) -> list:
    label_style = ParagraphStyle("TCLabel", parent=styles["Normal"], fontSize=10, textColor=MUTED, spaceAfter=2)
    value_style = ParagraphStyle("TCValue", parent=styles["Normal"], fontSize=11, spaceAfter=8)
    body_style = ParagraphStyle("TCBody", parent=styles["Normal"], fontSize=9.5, textColor=MUTED)

    approval_text = [
        Paragraph("For:", label_style),
        Paragraph(COMPANY_NAME, value_style),
        Paragraph(APPROVER_NAME, body_style),
    ]
    if os.path.exists(STAMP_PATH):
        stamp = Image(STAMP_PATH, width=0.9 * inch, height=0.9 / 1.1818 * inch)
        row = Table([[approval_text, stamp]], colWidths=[4.4 * inch, 1.2 * inch])
        row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        return [row]
    return approval_text


def generate_employee_tax_certificate_pdf_bytes(data: dict) -> bytes:
    buf = io.BytesIO()
    fiscal_year = data["fiscal_year"]
    employee = data["employee"]
    months = data["months"]
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        # Without these, reportlab defaults every PDF's Title/Author metadata
        # to the literal string "anonymous" — that's what a PDF viewer's tab
        # title or file-properties panel shows if it's never set explicitly.
        title=f"Tax Certificate - {employee.name} - {fiscal_year}",
        author=COMPANY_NAME,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TCTitle", parent=styles["Heading1"], fontSize=14, textColor=BRAND, spaceBefore=18, spaceAfter=2, alignment=1)
    subtitle_style = ParagraphStyle("TCSubtitle", parent=styles["Normal"], fontSize=10, textColor=MUTED, spaceAfter=2, alignment=1)
    period_style = ParagraphStyle("TCPeriod", parent=styles["Normal"], fontSize=11, spaceAfter=14, alignment=1)
    body_style = ParagraphStyle("TCBody", parent=styles["Normal"], fontSize=10, spaceAfter=10)

    story = []
    story.extend(_letterhead_story(styles))
    story.append(Spacer(1, 10))
    story.append(Paragraph("CERTIFICATE OF DEDUCTION OF INCOME TAX", title_style))
    story.append(Paragraph("Under Section 149 of the Income Tax Ordinance, 2001", subtitle_style))
    story.append(Paragraph(f"{_tax_year_label(fiscal_year)} &nbsp;&middot;&nbsp; {fiscal_year} &nbsp;&middot;&nbsp; {_fy_period_label(fiscal_year)}", period_style))

    story.append(Paragraph(
        "This is to certify that income tax has been deducted at source from the salary income "
        f"paid to the employee named below during the above tax year, as per the details given below.",
        body_style,
    ))

    info_rows = [
        ["Employee Name:", employee.name, "Employee ID:", employee.id[:8]],
        ["CNIC:", employee.cnic or "—", "Designation:", employee.role],
        ["Department:", employee.department, "Date of Joining:", employee.start_date.strftime("%d %b %Y") if employee.start_date else "—"],
    ]
    info_table = Table(info_rows, colWidths=[1.2 * inch, 2.2 * inch, 1.2 * inch, 2.2 * inch])
    info_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 14))

    rows = [["Month", "Gross Salary (PKR)", "Tax Deducted (PKR)", "Net Paid (PKR)"]]
    for s in months:
        rows.append([_month_label(s.month), _fmt_money(s.gross_salary), _fmt_money(s.tax), _fmt_money(s.net_salary)])
    rows.append(["TOTAL", _fmt_money(data["total_gross"]), _fmt_money(data["total_tax"]), _fmt_money(data["total_net"])])

    table = Table(rows, colWidths=[1.7 * inch, 1.8 * inch, 1.8 * inch, 1.8 * inch])
    table.setStyle(TableStyle([
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
    story.append(table)
    story.append(Spacer(1, 6))

    if len(months) < 12:
        story.append(Paragraph(
            f"Note: this employee's record for the tax year covers {len(months)} month(s) only "
            "(employment did not span the full fiscal year).",
            ParagraphStyle("TCNote", parent=styles["Normal"], fontSize=9, textColor=MUTED),
        ))

    story.append(Spacer(1, 16))
    story.append(Paragraph(
        f"<b>Total Income Tax Deducted at Source for the {_tax_year_label(fiscal_year)}: {_fmt_money(data['total_tax'])}</b>",
        body_style,
    ))
    story.append(Paragraph(
        "This certificate is issued for the purpose of filing an Income Tax Return with the Federal "
        "Board of Revenue (FBR) of Pakistan and serves as evidence of tax withheld at source under "
        "Section 149 of the Income Tax Ordinance, 2001.",
        body_style,
    ))

    story.append(Spacer(1, 20))
    story.extend(_signature_block(styles))

    story.append(Spacer(1, 16))
    story.append(Paragraph(
        f"Date of Issue: {now_pkt().date().strftime('%d %B %Y')}. This is a system-generated certificate issued by ORBIT.",
        ParagraphStyle("TCFooter", parent=styles["Normal"], fontSize=8.5, textColor=MUTED),
    ))

    doc.build(story)
    return buf.getvalue()


def generate_company_tax_certificate_pdf_bytes(data: dict) -> bytes:
    buf = io.BytesIO()
    fiscal_year = data["fiscal_year"]
    lines = data["lines"]
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        # Without these, reportlab defaults every PDF's Title/Author metadata
        # to the literal string "anonymous" — that's what a PDF viewer's tab
        # title or file-properties panel shows if it's never set explicitly.
        title=f"Company Tax Statement - {fiscal_year}",
        author=COMPANY_NAME,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TCTitle", parent=styles["Heading1"], fontSize=14, textColor=BRAND, spaceBefore=18, spaceAfter=2, alignment=1)
    subtitle_style = ParagraphStyle("TCSubtitle", parent=styles["Normal"], fontSize=10, textColor=MUTED, spaceAfter=2, alignment=1)
    period_style = ParagraphStyle("TCPeriod", parent=styles["Normal"], fontSize=11, spaceAfter=14, alignment=1)
    body_style = ParagraphStyle("TCBody", parent=styles["Normal"], fontSize=10, spaceAfter=10)

    story = []
    story.extend(_letterhead_story(styles))
    story.append(Spacer(1, 10))
    story.append(Paragraph("ANNUAL STATEMENT OF TAX DEDUCTED FROM SALARIES", title_style))
    story.append(Paragraph("Company-wide withholding statement — Section 165, Income Tax Ordinance, 2001", subtitle_style))
    story.append(Paragraph(f"{_tax_year_label(fiscal_year)} &nbsp;&middot;&nbsp; {fiscal_year} &nbsp;&middot;&nbsp; {_fy_period_label(fiscal_year)}", period_style))

    rows = [["#", "Employee Name", "CNIC", "Designation", "Gross Salary (PKR)", "Tax Deducted (PKR)"]]
    for i, row in enumerate(lines, start=1):
        emp = row["employee"]
        rows.append([str(i), emp.name, emp.cnic or "—", emp.role, _fmt_money(row["total_gross"]), _fmt_money(row["total_tax"])])
    rows.append(["", "", "", "TOTAL", _fmt_money(data["total_gross"]), _fmt_money(data["total_tax"])])

    table = Table(rows, colWidths=[0.35 * inch, 1.6 * inch, 1.15 * inch, 1.5 * inch, 1.3 * inch, 1.3 * inch])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (4, 0), (-1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, RULE),
        ("LINEABOVE", (0, -1), (-1, -1), 1, BRAND),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]))
    story.append(table)
    story.append(Spacer(1, 14))

    story.append(Paragraph(f"Total employees covered: {len(lines)}", body_style))
    story.append(Paragraph(
        f"<b>Total Income Tax Deducted and Deposited for the {_tax_year_label(fiscal_year)}: {_fmt_money(data['total_tax'])}</b>",
        body_style,
    ))
    story.append(Paragraph(
        "This statement summarizes tax withheld at source from salaries of all employees during the "
        "above tax year, for internal record-keeping and FBR withholding statement reconciliation "
        "purposes under Section 165 of the Income Tax Ordinance, 2001.",
        body_style,
    ))

    story.append(Spacer(1, 20))
    story.extend(_signature_block(styles))

    story.append(Spacer(1, 16))
    story.append(Paragraph(
        f"Date of Issue: {now_pkt().date().strftime('%d %B %Y')}. This is a system-generated statement issued by ORBIT.",
        ParagraphStyle("TCFooter", parent=styles["Normal"], fontSize=8.5, textColor=MUTED),
    ))

    doc.build(story)
    return buf.getvalue()


def safe_employee_certificate_filename(employee_name: str, fiscal_year: str) -> str:
    cleaned = "".join(c for c in f"{employee_name}_{fiscal_year}" if c.isalnum() or c in ("-", "_"))
    return f"tax-certificate-{cleaned or 'employee'}.pdf"


def safe_company_certificate_filename(fiscal_year: str) -> str:
    cleaned = "".join(c for c in fiscal_year if c.isalnum() or c in ("-", "_"))
    return f"company-tax-statement-{cleaned or date.today().year}.pdf"
