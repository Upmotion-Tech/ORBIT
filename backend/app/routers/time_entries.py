from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.time import now_pkt
from app.repositories.time_entry_repository import TimeEntryRepository
from app.schemas.time_entry import TimeEntryCreate, TimeEntryResponse

router = APIRouter(prefix="/api/time-entries", tags=["Time Entries"])


def get_time_entry_repository(db: AsyncSession = Depends(get_db)) -> TimeEntryRepository:
    return TimeEntryRepository(db)


@router.get("/")
async def list_time_entries(
    project_id: Optional[str] = None,
    repo: TimeEntryRepository = Depends(get_time_entry_repository),
):
    all_entries = await repo.find_all(project_id)

    # "This week" = the current Mon-Sun window in PKT — previously every
    # entry ever logged was summed with no date scoping at all, so "Time
    # logged this week" kept growing forever and "Resource allocation"
    # (hours / 40) would blow past 100% permanently after a few weeks.
    today = now_pkt().date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    entries = [e for e in all_entries if week_start <= e.created_at.date() <= week_end]

    # One row per employee this week (previously one row per raw log entry,
    # which repeated the same name once per entry logged).
    employee_hours = {}
    for entry in entries:
        employee_hours[entry.employee_name] = employee_hours.get(entry.employee_name, 0.0) + entry.hours

    week_label = f"{week_start.strftime('%d')}–{week_end.strftime('%d %b')}"
    time_rows = [
        {"employee_name": name, "hours": round(hours, 1), "week": week_label}
        for name, hours in sorted(employee_hours.items(), key=lambda kv: -kv[1])
    ]

    allocations = [
        {
            "name": name,
            "pct": min(100, round(hours / 40.0 * 100)),
            "pctStr": f"{min(100, round(hours / 40.0 * 100))}% capacity allocated this week",
        }
        for name, hours in sorted(employee_hours.items(), key=lambda kv: -kv[1])
    ]

    return {
        "time_entries": time_rows,
        "allocations": allocations,
    }


@router.post("/", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    data: TimeEntryCreate,
    repo: TimeEntryRepository = Depends(get_time_entry_repository),
):
    entry = await repo.create(data.model_dump())
    return TimeEntryResponse.model_validate(entry)
