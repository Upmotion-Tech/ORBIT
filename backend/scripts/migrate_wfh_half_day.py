"""
Adds wfh_requests.half_day (nullable varchar — null means a full-day
request, "First Half"/"Second Half" means only that half is WFH).

Base.metadata.create_all (run on every startup) only creates tables that
don't exist yet — it never alters an existing table to add a new column, so
this one-off ALTER is needed for any database that already has a
wfh_requests table. Safe to run more than once: skips the ALTER if the
column is already there. Works against whichever DATABASE_URL is configured.

Nullable with no default and no backfill on purpose: every existing row is a
full-day request, and NULL is exactly how the model represents that — see
WfhRequest.half_day.

Run from backend/: python -m scripts.migrate_wfh_half_day
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine


async def main():
    async with engine.begin() as conn:
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("wfh_requests")}
        )
        if "half_day" in existing_columns:
            print("[OK] wfh_requests.half_day already exists - nothing to do.")
            return

        print("[OK] Adding wfh_requests.half_day ...")
        await conn.execute(text("ALTER TABLE wfh_requests ADD COLUMN half_day VARCHAR(20)"))
        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
