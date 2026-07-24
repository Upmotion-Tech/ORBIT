import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import engine, Base, async_session_factory
from app.core.time import PKT
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.employee_repository import EmployeeRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.wfh_request_repository import WfhRequestRepository
from app.repositories.leave_repository import LeaveRepository
from app.repositories.holiday_repository import HolidayRepository
from app.services.attendance_service import AttendanceService
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
    attendance,
    wfh_requests,
    customers,
    policies,
    tax_slabs,
    tax_certificates,
)

logger = logging.getLogger("orbit.attendance")


async def _run_attendance_sweep():
    # Own session, independent of any request — this runs off a scheduled
    # trigger, not an HTTP call. Marks anyone with no attendance row for
    # today as Absent and notifies them; no-ops entirely on weekends (see
    # AttendanceService.run_end_of_day_sweep).
    async with async_session_factory() as db:
        service = AttendanceService(
            AttendanceRepository(db), EmployeeRepository(db), NotificationRepository(db),
            wfh_repo=WfhRequestRepository(db), leave_repo=LeaveRepository(db),
            holiday_repo=HolidayRepository(db),
        )
        count = await service.run_end_of_day_sweep()
        await db.commit()
        logger.info(f"[attendance] end-of-day sweep marked {count} employee(s) absent")


async def _run_notification_cleanup():
    # Notifications are meant to be a short-lived "what just happened" feed,
    # not a permanent log (that's what the Audit Trail is for) — anything
    # older than 24h is deleted outright, read or not, so the list never
    # grows unbounded.
    async with async_session_factory() as db:
        repo = NotificationRepository(db)
        count = await repo.delete_older_than(hours=24)
        await db.commit()
        logger.info(f"[notifications] cleanup swept {count} notification(s) older than 24h")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Demo/seed data must never run automatically on server startup — it has
    # no way to know whether it's pointed at a fresh local dev DB or live
    # production, and an "empty table means seed it" check is true for both.
    # This once fired against the real production Neon database (an empty
    # `invoices` table there, post go-live wipe, looked identical to a fresh
    # local DB to seed_finance.py's own check) and inserted fake demo
    # invoices/expenses/milestones/salary-slips straight into production.
    # Run `python -m scripts.seed_hr` / `python -m scripts.seed_finance`
    # manually against a specific DATABASE_URL when real seeding is wanted.

    # Runs once daily at 23:55 PKT — anyone who never marked attendance that
    # day gets swept to Absent + notified. In-process scheduler: fine for
    # this app's current single-instance deployment, but would double-fire
    # per day if this ever runs as more than one worker process.
    scheduler = AsyncIOScheduler(timezone=PKT)
    scheduler.add_job(_run_attendance_sweep, CronTrigger(hour=23, minute=55, timezone=PKT))
    # Hourly rather than daily — a straight 24h-old cutoff means yesterday's
    # notifications should disappear close to when they actually turn 24h
    # old, not all at once at some fixed time of day.
    scheduler.add_job(_run_notification_cleanup, IntervalTrigger(hours=1))
    scheduler.start()

    yield
    scheduler.shutdown(wait=False)
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
app.include_router(attendance.router)
app.include_router(wfh_requests.router)
app.include_router(customers.router)
app.include_router(policies.router)
app.include_router(tax_slabs.router)
app.include_router(tax_certificates.router)



@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": settings.app_name, "version": settings.app_version}


@app.get("/")
async def root():
    # The frontend is a separate app (frontend-next, deployed independently
    # on Vercel) — this backend is API-only, no bundle to serve at "/" anymore.
    return {"status": "ok", "app": settings.app_name, "message": "ORBIT API — see /docs for interactive API documentation."}
