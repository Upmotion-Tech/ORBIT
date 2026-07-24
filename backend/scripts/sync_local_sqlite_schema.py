"""
Catches up a local SQLite orbit.db to every column that's landed on the
models since it was first created. Base.metadata.create_all (run on every
startup) only creates whole tables that don't exist yet — it never alters
an existing table to add a missing column, so a local dev DB that's been
sitting around since before some feature's migration silently drifts out of
sync with the current models (this is what "many errors running on local
sqlite" almost always means — sqlite3.OperationalError: no such column).

This is a one-shot catch-up covering everything known to have shipped only
against production so far, not a generic per-model schema differ — each
individual feature's own migrate_*.py script (idempotent, dialect-agnostic)
remains the source of truth for that specific column if this ever needs
updating for something new.

Safe to run more than once — skips any column that's already there.
Run from backend/: python -m scripts.sync_local_sqlite_schema
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine

# (table, column, ddl_type_and_constraints)
COLUMNS = [
    ("employees", "cnic", "VARCHAR(15)"),
    ("employees", "contract_file_data", "BLOB"),
    ("employees", "contract_file_name", "VARCHAR(255)"),
    ("notifications", "related_type", "VARCHAR(50)"),
    ("notifications", "related_id", "VARCHAR(36)"),
    ("salary_slips", "tax_is_manual", "BOOLEAN NOT NULL DEFAULT 0"),
    ("attendance_records", "leave_request_id", "VARCHAR(36)"),
    ("leads", "scope_document_data", "BLOB"),
    ("leads", "scope_document_filename", "VARCHAR(255)"),
    ("leads", "signed_contract_data", "BLOB"),
    ("leads", "signed_contract_filename", "VARCHAR(255)"),
    ("projects", "completed_at", "DATETIME"),
    ("invoices", "ntn", "VARCHAR(100)"),
    ("invoices", "registration_number", "VARCHAR(100)"),
    ("project_attachments", "file_data", "BLOB"),
    ("holidays", "end_date", "DATE"),
]


async def main():
    async with engine.begin() as conn:
        existing_tables = await conn.run_sync(lambda sync_conn: set(inspect(sync_conn).get_table_names()))
        added, skipped_no_table, skipped_exists = [], [], []

        for table, column, ddl in COLUMNS:
            if table not in existing_tables:
                skipped_no_table.append(f"{table}.{column}")
                continue
            existing_columns = await conn.run_sync(
                lambda sync_conn, t=table: {c["name"] for c in inspect(sync_conn).get_columns(t)}
            )
            if column in existing_columns:
                skipped_exists.append(f"{table}.{column}")
                continue
            await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            added.append(f"{table}.{column}")

        print(f"[OK] Added {len(added)} column(s): {', '.join(added) or '(none)'}")
        if skipped_exists:
            print(f"[OK] Already up to date: {len(skipped_exists)} column(s)")
        if skipped_no_table:
            print(f"[WARN] Table doesn't exist yet (will be created by the app's own startup, then re-run this): {', '.join(skipped_no_table)}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
