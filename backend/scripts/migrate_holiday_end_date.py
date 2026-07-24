"""
Adds holidays.end_date (nullable date — null means a single-day holiday).

Base.metadata.create_all (run on every startup) only creates tables that
don't exist yet — it never alters an existing table to add a new column, so
this one-off ALTER is needed for any database that already has a holidays
table. Safe to run more than once: skips the ALTER if the column is already
there. Works against whichever DATABASE_URL is configured.

Run from backend/: python -m scripts.migrate_holiday_end_date
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine


async def main():
    async with engine.begin() as conn:
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("holidays")}
        )
        if "end_date" in existing_columns:
            print("[OK] holidays.end_date already exists — nothing to do.")
            return

        print("[OK] Adding holidays.end_date ...")
        await conn.execute(text("ALTER TABLE holidays ADD COLUMN end_date DATE"))
        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
