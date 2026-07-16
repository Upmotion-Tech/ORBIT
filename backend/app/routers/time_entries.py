from typing import Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
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
    entries = await repo.find_all(project_id)
    
    # Calculate allocations per employee (assuming 40 hours capacity)
    # Group hours by employee name
    employee_hours = {}
    for entry in entries:
        employee_hours[entry.employee_name] = employee_hours.get(entry.employee_name, 0.0) + entry.hours
        
    allocations = []
    for emp_name, hours in employee_hours.items():
        pct = min(100, round(hours / 40.0 * 100))
        allocations.append({
            "name": emp_name,
            "pctStr": f"{pct}% capacity allocated (all projects)"
        })
        
    return {
        "time_entries": [TimeEntryResponse.model_validate(e) for e in entries],
        "allocations": allocations
    }


@router.post("/", response_model=TimeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_time_entry(
    data: TimeEntryCreate,
    repo: TimeEntryRepository = Depends(get_time_entry_repository),
):
    entry = await repo.create(data.model_dump())
    return TimeEntryResponse.model_validate(entry)
