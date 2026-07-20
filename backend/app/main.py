import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base
from app.routers import (
    auth,
    leads,
    settings as settings_router,
    preferences,
    projects,
    tasks,
    notifications,
    time_entries,
    employees,
    leaves,
    job_openings,
    settings_hr,
    invoices,
    expenses,
    payroll,
    milestones,
    finance_stats,
    audit_log,
    expense_categories,
    dashboard_export,
    expense_category_budgets,
    crm_sources,
)

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        from scripts.seed_hr import seed as seed_hr
        await seed_hr()
    except Exception as e:
        print(f"[seed] HR seed skipped/errored: {e}")
    try:
        from scripts.seed_finance import seed as seed_finance
        await seed_finance()
    except Exception as e:
        print(f"[seed] Finance seed skipped/errored: {e}")
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "errors": {"detail": str(exc)} if settings.debug else None,
        },
    )


app.mount("/api/storage", StaticFiles(directory=settings.storage_path), name="storage")
app.include_router(auth.router)
app.include_router(leads.router)
app.include_router(settings_router.router)
app.include_router(preferences.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(notifications.router)
app.include_router(time_entries.router)
app.include_router(employees.router)
app.include_router(leaves.router)
app.include_router(job_openings.router)
app.include_router(settings_hr.router)
app.include_router(invoices.router)
app.include_router(expenses.router)
app.include_router(payroll.router)
app.include_router(milestones.router)
app.include_router(finance_stats.router)
app.include_router(audit_log.router)
app.include_router(expense_categories.router)
app.include_router(dashboard_export.router)
app.include_router(expense_category_budgets.router)
app.include_router(crm_sources.router)



@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.app_name, "version": settings.app_version}


@app.get("/")
async def serve_frontend():
    index_path = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(index_path)
