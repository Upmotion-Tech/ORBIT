"""
Adds salary_slips.tax_is_manual (boolean, default false).

Base.metadata.create_all (run on every startup) only creates tables that
don't exist yet — it never alters an existing table to add a new column, so
this one-off ALTER is needed for any database that already has a
salary_slips table. Safe to run more than once: skips the ALTER if the
column is already there. Works against whichever DATABASE_URL is configured.

Run from backend/: python -m scripts.migrate_salary_slip_tax_is_manual
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine


async def main():
    async with engine.begin() as conn:
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("salary_slips")}
        )
        if "tax_is_manual" in existing_columns:
            print("[OK] salary_slips.tax_is_manual already exists — nothing to do.")
            return

        print("[OK] Adding salary_slips.tax_is_manual ...")
        await conn.execute(text(
            "ALTER TABLE salary_slips ADD COLUMN tax_is_manual BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
