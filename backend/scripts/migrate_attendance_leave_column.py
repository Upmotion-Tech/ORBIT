"""
Adds attendance_records.leave_request_id (nullable FK -> leave_requests.id).

Base.metadata.create_all (run on every startup) only creates tables that
don't exist yet — it never alters an existing table to add a new column, so
this one-off ALTER is needed for any database that already has an
attendance_records table (every real deployment). Safe to run more than
once: skips the ALTER if the column is already there. Works against
whichever DATABASE_URL is configured (unset -> local SQLite orbit.db).

Run from backend/: python -m scripts.migrate_attendance_leave_column
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine


async def main():
    async with engine.begin() as conn:
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("attendance_records")}
        )
        if "leave_request_id" in existing_columns:
            print("[OK] attendance_records.leave_request_id already exists — nothing to do.")
            return

        print("[OK] Adding attendance_records.leave_request_id ...")
        await conn.execute(text(
            "ALTER TABLE attendance_records ADD COLUMN leave_request_id VARCHAR(36) "
            "REFERENCES leave_requests(id)"
        ))
        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
