"""
Adds wfh_requests.end_date (nullable date — null means a single-day request).

Base.metadata.create_all (run on every startup) only creates tables that
don't exist yet — it never alters an existing table to add a new column, so
this one-off ALTER is needed for any database that already has a
wfh_requests table. Safe to run more than once: skips the ALTER if the
column is already there. Works against whichever DATABASE_URL is configured.

Nullable with no default and no backfill on purpose: every existing row is a
single-day request, and NULL is exactly how the model already represents
that (see WfhRequest.end_date), so leaving them alone is the correct
migration rather than an omission. Every range check reads the column as
COALESCE(end_date, date), so untouched rows keep behaving identically.

Run from backend/: python -m scripts.migrate_wfh_end_date
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine


async def main():
    async with engine.begin() as conn:
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("wfh_requests")}
        )
        if "end_date" in existing_columns:
            print("[OK] wfh_requests.end_date already exists - nothing to do.")
            return

        print("[OK] Adding wfh_requests.end_date ...")
        await conn.execute(text("ALTER TABLE wfh_requests ADD COLUMN end_date DATE"))
        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
