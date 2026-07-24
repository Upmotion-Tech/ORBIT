"""
Adds employees.cnic (nullable varchar, "XXXXX-XXXXXXX-X" format).

Base.metadata.create_all (run on every startup) only creates tables that
don't exist yet — it never alters an existing table to add a new column, so
this one-off ALTER is needed for any database that already has an employees
table. Safe to run more than once: skips the ALTER if the column is already
there. Works against whichever DATABASE_URL is configured.

Run from backend/: python -m scripts.migrate_employee_cnic
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine


async def main():
    async with engine.begin() as conn:
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("employees")}
        )
        if "cnic" in existing_columns:
            print("[OK] employees.cnic already exists — nothing to do.")
            return

        print("[OK] Adding employees.cnic ...")
        await conn.execute(text("ALTER TABLE employees ADD COLUMN cnic VARCHAR(15)"))
        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
