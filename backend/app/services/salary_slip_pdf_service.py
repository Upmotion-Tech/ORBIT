"""
Generates the Salary Slip PDF directly with reportlab, laid out to match
"Salary Slip General template.docx" (supplied by the user) field-for-field —
extracted from that file's own XML/embedded images, not guessed. Unlike
invoice_pdf_service.py / tax_certificate_pdf_service.py, this one uses
reportlab's raw Canvas rather than a top-down Platypus flowable story: the
source template relies on genuinely overlapping/absolute-positioned elements
(a full-page background watermark, two side-by-side floating text blocks at
the same height, a signature+stamp cluster) that don't fit a flowing
document model. The page size is real A4 (the template's own page size),
not the US Letter the other PDF services use, since this is what the
template itself is.

Assets extracted from the template: the logo/stamp are the same artwork
already at app/assets/upmotion_logo.png / upmotion_stamp.png (reused as-is);
the signature, background watermark, and decorative footer icon cluster are
new to this template and live at app/assets/salary_slip_*.png.
"""
import io
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Table, TableStyle

from app.models.salary_slip import SalarySlip
from app.services.invoice_pdf_service import amount_in_words

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
LOGO_PATH = os.path.join(ASSETS_DIR, "upmotion_logo.png")
STAMP_PATH = os.path.join(ASSETS_DIR, "upmotion_stamp.png")
SIGNATURE_PATH = os.path.join(ASSETS_DIR, "salary_slip_signature.png")
WATERMARK_PATH = os.path.join(ASSETS_DIR, "salary_slip_watermark.png")
FOOTER_ICONS_PATH = os.path.join(ASSETS_DIR, "salary_slip_footer_icons.png")

COMPANY_ADDRESS_LINES = [
    "P7, 5th floor, Conetwork || TAMC, MMAlam road, Gulberg 3, Lahore Pakistan",
    "www.theupmotion.com",
]

BRAND = colors.HexColor("#4F46E5")
BRAND_LIGHT = colors.HexColor("#EEF2FF")
RULE = colors.HexColor("#E5E7EB")
MUTED = colors.HexColor("#666666")
BLACK = colors.HexColor("#111111")

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

PAGE_W, PAGE_H = A4
MARGIN = 72  # 1 inch, matching the template's own page margins


def _fmt_money(n: float) -> str:
    return f"{n:,.2f}" if n % 1 else f"{n:,.0f}"


def _month_label(month: str) -> str:
    try:
        year, m = month.split("-")
        return f"{MONTH_NAMES[int(m) - 1]} {year}"
    except (ValueError, IndexError):
        return month


def _image_height_for_width(path: str, width: float) -> float:
    from PIL import Image as PILImage
    with PILImage.open(path) as im:
        w, h = im.size
    return width * h / w


def _draw_image_preserving_aspect(c: Canvas, path: str, x: float, top_y: float, width: float) -> float:
    """Draws an image so its left edge is at x and its TOP edge is at
    top_y (measured from the top of the page, matching how the source
    template's own position offsets are expressed), scaled to the given
    width with aspect ratio preserved. Returns the rendered height."""
    height = _image_height_for_width(path, width)
    c.drawImage(path, x, PAGE_H - top_y - height, width=width, height=height, mask="auto")
    return height


def _draw_image_from_bottom(c: Canvas, path: str, x: float, y_bottom: float, width: float) -> float:
    """Draws an image so its left edge is at x and its BOTTOM edge is at
    y_bottom (canvas-native coordinates, y increasing upward) — used below
    the fold where positioning relative to the bottom of the page is more
    natural than relative to the top. Returns the rendered height."""
    height = _image_height_for_width(path, width)
    c.drawImage(path, x, y_bottom, width=width, height=height, mask="auto")
    return height


def generate_salary_slip_pdf_bytes(slip: SalarySlip) -> bytes:
    emp = slip.employee
    employee_name = emp.name if emp else "Employee"

    buf = io.BytesIO()
    c = Canvas(buf, pagesize=A4)
    c.setTitle(f"Salary Slip - {employee_name} - {_month_label(slip.month)}")
    c.setAuthor("Upmotion Tech")

    # ---- Background watermark (centered on the printable area, behind
    # everything else — drawn first so later content paints over it) ----
    if os.path.exists(WATERMARK_PATH):
        wm_w, wm_h = 340, 260
        c.drawImage(
            WATERMARK_PATH,
            (PAGE_W - wm_w) / 2, (PAGE_H - wm_h) / 2,
            width=wm_w, height=wm_h, mask="auto",
        )

    # ---- Header: logo top-left, address block top-right ----
    if os.path.exists(LOGO_PATH):
        _draw_image_preserving_aspect(c, LOGO_PATH, MARGIN - 28, 30, 112)
    else:
        c.setFont("Helvetica-Bold", 18)
        c.drawString(MARGIN, PAGE_H - 50, "Upmotion Tech")

    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    addr_y = PAGE_H - 40
    for line in COMPANY_ADDRESS_LINES:
        c.drawRightString(PAGE_W - MARGIN + 10, addr_y, line)
        addr_y -= 10
    c.setFillColor(BLACK)

    # ---- Title ----
    c.setFont("Helvetica-Bold", 17)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 110, "Salary Slip")

    # ---- Employee info: two columns (left: Date of Joining / Salary
    # Period, right: Employee Name / Designation / Department) ----
    info_top = PAGE_H - 155
    left_x = MARGIN
    right_x = PAGE_W / 2 + 10

    c.setFont("Helvetica-Bold", 10)
    c.drawString(left_x, info_top, "Date of Joining:")
    c.setFont("Helvetica", 10)
    join_str = emp.start_date.strftime("%d %b %Y") if emp and emp.start_date else "—"
    c.drawString(left_x + 95, info_top, join_str)

    c.setFont("Helvetica-Bold", 10)
    c.drawString(left_x, info_top - 20, "Salary Period:")
    c.setFont("Helvetica", 10)
    c.drawString(left_x + 95, info_top - 20, _month_label(slip.month))

    c.setFont("Helvetica-Bold", 12)
    c.drawString(right_x, info_top + 8, employee_name)

    c.setFont("Helvetica-Bold", 10)
    c.drawString(right_x, info_top - 12, "Designation:")
    c.setFont("Helvetica", 10)
    c.drawString(right_x + 70, info_top - 12, emp.role if emp else "—")

    c.setFont("Helvetica-Bold", 10)
    c.drawString(right_x, info_top - 32, "Department:")
    c.setFont("Helvetica", 10)
    c.drawString(right_x + 70, info_top - 32, emp.department if emp else "—")

    # ---- Earnings / Deductions table ----
    basic_pay = slip.gross_salary
    incentive_pay = slip.bonus
    house_rent_allowance = slip.allowances
    meal_allowance = 0.0
    total_earnings = basic_pay + incentive_pay + house_rent_allowance + meal_allowance

    income_tax = slip.tax
    other_deductions = slip.other_deductions
    total_deductions = income_tax + other_deductions

    net_pay = slip.net_salary

    rows = [
        ["Earnings", "Amount", "Deductions", "Amount"],
        ["Basic Pay", _fmt_money(basic_pay), "Income Tax", _fmt_money(income_tax)],
        ["Incentive Pay", _fmt_money(incentive_pay), "Other Deductions", _fmt_money(other_deductions)],
        ["House Rent Allowance", _fmt_money(house_rent_allowance), "", ""],
        ["Meal Allowance", _fmt_money(meal_allowance), "", ""],
        ["Total Earnings", _fmt_money(total_earnings), "Total Deductions", _fmt_money(total_deductions)],
        ["Net Pay", "", "", f"{_fmt_money(net_pay)} PKR"],
    ]
    col_w = (PAGE_W - 2 * MARGIN) / 4
    table = Table(rows, colWidths=[col_w] * 4)
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTNAME", (0, -2), (-1, -2), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.5, RULE),
        ("LINEABOVE", (0, -1), (-1, -1), 1, BRAND),
        ("TEXTCOLOR", (0, -1), (-1, -1), BRAND),
    ]))
    table_top = info_top - 60
    tw, th = table.wrapOn(c, 0, 0)
    table.drawOn(c, MARGIN, table_top - th)

    # ---- In Words ----
    words_y = table_top - th - 22
    c.setFont("Helvetica-Bold", 10)
    c.drawString(MARGIN, words_y, "In Words:")
    c.setFont("Helvetica", 10)
    c.drawString(MARGIN + 55, words_y, amount_in_words(net_pay, "PKR"))

    below_words_y = words_y
    if slip.deduction_reason:
        c.setFont("Helvetica", 9)
        c.setFillColor(MUTED)
        c.drawString(MARGIN, words_y - 16, f"Deduction note: {slip.deduction_reason}")
        c.setFillColor(BLACK)
        below_words_y -= 16

    # ---- Employer signature block: stamp + signature over a sign line,
    # positioned a fixed gap below wherever the content above happens to
    # end (rather than a hardcoded page position), so it can never overlap
    # a taller-than-usual table/notes section above it. ----
    sig_h = _image_height_for_width(SIGNATURE_PATH, 95) if os.path.exists(SIGNATURE_PATH) else 0
    stamp_h = _image_height_for_width(STAMP_PATH, 110) if os.path.exists(STAMP_PATH) else 0
    images_bottom_y = below_words_y - 40 - max(sig_h, stamp_h)
    if os.path.exists(SIGNATURE_PATH):
        _draw_image_from_bottom(c, SIGNATURE_PATH, MARGIN + 20, images_bottom_y, 95)
    if os.path.exists(STAMP_PATH):
        _draw_image_from_bottom(c, STAMP_PATH, MARGIN + 95, images_bottom_y, 110)

    line_y = images_bottom_y - 14
    c.setLineWidth(1)
    c.line(MARGIN, line_y, MARGIN + 160, line_y)
    c.setFont("Helvetica", 10)
    c.drawString(MARGIN, line_y - 14, "Employer Signature")

    # ---- Footer decorative icons (centered near the bottom) ----
    if os.path.exists(FOOTER_ICONS_PATH):
        foot_w = 130
        from PIL import Image as PILImage
        with PILImage.open(FOOTER_ICONS_PATH) as im:
            iw, ih = im.size
        foot_h = foot_w * ih / iw
        c.drawImage(
            FOOTER_ICONS_PATH,
            (PAGE_W - foot_w) / 2, 36,
            width=foot_w, height=foot_h, mask="auto",
        )

    c.showPage()
    c.save()
    return buf.getvalue()


def safe_salary_slip_filename(employee_name: str, month: str) -> str:
    cleaned = "".join(c for c in f"{employee_name}_{month}" if c.isalnum() or c in ("-", "_"))
    return f"salary-slip-{cleaned or 'employee'}.pdf"
