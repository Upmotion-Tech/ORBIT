"""
One-off: clear existing HR data so scripts.seed_hr can reseed fresh data.
Usage: python -m scripts.wipe_hr
"""
import asyncio

from sqlalchemy import delete

from app.core.database import async_session_factory
from app.models.employee import Employee
from app.models.leave_request import LeaveRequest
from app.models.job_opening import JobOpening
from app.models.hiring_candidate import HiringCandidate
from app.models.leave_policy import LeavePolicy
from app.models.holiday import Holiday
from app.models.notification import Notification


async def wipe():
    async with async_session_factory() as session:
        await session.execute(delete(HiringCandidate))
        await session.execute(delete(JobOpening))
        await session.execute(delete(LeaveRequest))
        await session.execute(delete(Notification))
        await session.execute(delete(LeavePolicy))
        await session.execute(delete(Holiday))
        await session.execute(delete(Employee))
        await session.commit()
        print("Wiped HR tables (employees, leave_requests, job_openings, hiring_candidates, notifications, leave_policy, holidays).")


if __name__ == "__main__":
    asyncio.run(wipe())
