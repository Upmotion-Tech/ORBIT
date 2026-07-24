"""
Generates a Salary Slip PDF directly with reportlab, mirroring the exact
approach invoice_pdf_service.py already uses (no Word/LibreOffice/external
binary, so it runs identically on Render as it does locally). This is a
placeholder template — plain letterhead + a figures table — until a real
company salary-slip template is provided to match it against.
"""
import io
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from app.models.salary_slip import SalarySlip

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "upmotion_logo.png")

COMPANY_ADDRESS = "29-C Main Gulberg, Lahore Pakistan"

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


def generate_salary_slip_pdf_bytes(slip: SalarySlip) -> bytes:
    buf = io.BytesIO()
    employee_name = slip.employee.name if slip.employee else "Employee"
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        # Without these, reportlab defaults every PDF's Title/Author metadata
        # to the literal string "anonymous" — that's what a PDF viewer's tab
        # title or file-properties panel shows if it's never set explicitly.
        title=f"Salary Slip - {employee_name} - {_month_label(slip.month)}",
        author="Upmotion Tech",
    )
    styles = getSampleStyleSheet()
    company_style = ParagraphStyle("ORBITCompany", parent=styles["Title"], fontSize=18, spaceAfter=0)
    tagline_style = ParagraphStyle("ORBITTagline", parent=styles["Normal"], textColor=MUTED, fontSize=9, spaceAfter=0)
    title_style = ParagraphStyle("ORBITSlipTitle", parent=styles["Heading1"], fontSize=15, textColor=BRAND, spaceBefore=18, spaceAfter=2)
    label_style = ParagraphStyle("ORBITLabel", parent=styles["Normal"], fontSize=10, textColor=MUTED, spaceAfter=2)
    value_style = ParagraphStyle("ORBITValue", parent=styles["Normal"], fontSize=11, spaceAfter=8)
    body_style = ParagraphStyle("ORBITBody", parent=styles["Normal"], fontSize=9.5, textColor=MUTED)

    story = []

    # ---- Letterhead ----
    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=1.6 * inch, height=1.6 / 2.9924 * inch)
        story.append(logo)
    else:
        story.append(Paragraph("Upmotion Tech", company_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph(COMPANY_ADDRESS, tagline_style))

    story.append(Paragraph("Salary Slip", title_style))
    story.append(Paragraph(_month_label(slip.month), value_style))

    # ---- Employee info ----
    emp = slip.employee
    info_rows = [
        ["Employee Name:", emp.name if emp else "—", "Employee ID:", (emp.id if emp else "—")[:8]],
        ["Designation:", emp.role if emp else "—", "Department:", emp.department if emp else "—"],
        ["CNIC:", (emp.cnic if emp and emp.cnic else "—"), "Payment Status:", slip.payment_status],
    ]
    info_table = Table(info_rows, colWidths=[1.1 * inch, 2.3 * inch, 1.1 * inch, 2.3 * inch])
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

    # ---- Figures ----
    rows = [
        ["Earnings", "Amount", "Deductions", "Amount"],
        ["Gross Salary", _fmt_money(slip.gross_salary), "Income Tax", _fmt_money(slip.tax)],
        ["Allowances", _fmt_money(slip.allowances), "Other Deductions", _fmt_money(slip.other_deductions)],
        ["Bonus", _fmt_money(slip.bonus), "", ""],
        ["", "", "", ""],
    ]
    figures_table = Table(rows, colWidths=[1.7 * inch, 1.7 * inch, 1.7 * inch, 1.7 * inch])
    figures_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, 0), 1, RULE),
        ("LINEBELOW", (0, -2), (-1, -2), 0.5, RULE),
    ]))
    story.append(figures_table)
    if slip.deduction_reason:
        story.append(Spacer(1, 4))
        story.append(Paragraph(f"Deduction note: {slip.deduction_reason}", body_style))
    story.append(Spacer(1, 10))

    net_table = Table([["Net Salary", _fmt_money(slip.net_salary)]], colWidths=[5.1 * inch, 1.7 * inch])
    net_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 13),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, -1), BRAND),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LINEABOVE", (0, 0), (-1, 0), 1, BRAND),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(net_table)

    story.append(Spacer(1, 24))
    story.append(Paragraph(
        "This is a system-generated salary slip and does not require a signature. "
        "For any discrepancies, please contact HR/Finance.",
        body_style,
    ))

    doc.build(story)
    return buf.getvalue()


def safe_salary_slip_filename(employee_name: str, month: str) -> str:
    cleaned = "".join(c for c in f"{employee_name}_{month}" if c.isalnum() or c in ("-", "_"))
    return f"salary-slip-{cleaned or 'employee'}.pdf"
