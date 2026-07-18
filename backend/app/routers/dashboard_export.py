from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.core.dependencies import get_current_user
from app.schemas.dashboard_export import DashboardExportRequest
from app.services.dashboard_export_service import build_excel, build_pdf
from app.core.time import now_pkt

router = APIRouter(prefix="/api/dashboard/export", tags=["Dashboard Export"])


@router.post("/excel")
async def export_dashboard_excel(
    body: DashboardExportRequest,
    current_user: dict = Depends(get_current_user),
):
    content = build_excel(body)
    filename = f"ORBIT-Dashboard-{now_pkt().date().isoformat()}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/pdf")
async def export_dashboard_pdf(
    body: DashboardExportRequest,
    current_user: dict = Depends(get_current_user),
):
    content = build_pdf(body)
    filename = f"ORBIT-Dashboard-{now_pkt().date().isoformat()}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
