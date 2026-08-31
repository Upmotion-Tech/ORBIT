"""
Adds attendance_records.half_day (nullable varchar) and widens its unique
constraint from (employee_id, date) to (employee_id, date, half_day).

Why: a half-day Leave/WFH day can now need up to TWO attendance rows for the
same employee/date — one per half (see AttendanceService.mark_attendance) —
which the old two-column constraint would reject as a duplicate. NULL means
a normal, single full-day record, exactly like every row before this.

NOTE: Postgres (and SQLite) treat every NULL as distinct for uniqueness
purposes, so the widened constraint alone doesn't stop two half_day=NULL
(normal) rows for the same employee/date — that guarantee still comes from
mark_attendance's own check-before-create, same as it always has.

Safe to run more than once: checks the column and constraint independently
and skips whichever part is already done.

Postgres: ADD COLUMN, then drop the old constraint and add the new one
(both idempotent via IF EXISTS / a name check).
SQLite: ADD COLUMN works directly (SQLite permits adding a nullable column
without a table rebuild), but changing a unique constraint does need the
usual SQLite rebuild (create the new shape -> copy every row -> drop old ->
rename), same approach as migrate_wfh_drop_unique.py.

Run from backend/: python -m scripts.migrate_attendance_half_day
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine

OLD_CONSTRAINT = "uq_attendance_employee_date"
NEW_CONSTRAINT = "uq_attendance_employee_date_half"

# Column order must match the current AttendanceRecord model. Used only on
# the SQLite rebuild path.
COLUMNS = [
    "id", "employee_id", "date", "half_day", "status", "marked_at",
    "leave_request_id", "created_at", "updated_at",
]

SQLITE_NEW_TABLE = """
CREATE TABLE attendance_records_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL REFERENCES employees (id),
    date DATE NOT NULL,
    half_day VARCHAR(20),
    status VARCHAR(20) NOT NULL,
    marked_at DATETIME,
    leave_request_id VARCHAR(36) REFERENCES leave_requests (id),
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE (employee_id, date, half_day)
)
"""


async def main():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("attendance_records")}
        )
        has_half_day_column = "half_day" in existing_columns

        if dialect == "postgresql":
            if not has_half_day_column:
                print("[OK] Adding attendance_records.half_day ...")
                await conn.execute(text("ALTER TABLE attendance_records ADD COLUMN half_day VARCHAR(20)"))
            else:
                print("[OK] attendance_records.half_day already exists.")

            constraint_names = await conn.run_sync(
                lambda sync_conn: {uc.get("name") for uc in inspect(sync_conn).get_unique_constraints("attendance_records")}
            )
            if NEW_CONSTRAINT in constraint_names:
                print(f"[OK] {NEW_CONSTRAINT} already exists - nothing to do.")
            else:
                print(f"[OK] Replacing {OLD_CONSTRAINT} with {NEW_CONSTRAINT} ...")
                await conn.execute(text(f"ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS {OLD_CONSTRAINT}"))
                await conn.execute(text(
                    f"ALTER TABLE attendance_records ADD CONSTRAINT {NEW_CONSTRAINT} "
                    "UNIQUE (employee_id, date, half_day)"
                ))
                print("[OK] Migration complete.")
        else:
            # SQLite: check whether a rebuild is even still needed — if
            # half_day already exists AND the old 2-column constraint is
            # already gone, there's nothing left to do.
            constraint_cols = await conn.run_sync(
                lambda sync_conn: [tuple(uc.get("column_names") or []) for uc in inspect(sync_conn).get_unique_constraints("attendance_records")]
            )
            needs_rebuild = has_half_day_column and ("employee_id", "date") not in constraint_cols
            if needs_rebuild:
                print("[OK] attendance_records already migrated - nothing to do.")
                return

            print("[OK] SQLite detected - rebuilding attendance_records with half_day + widened unique constraint ...")
            target_cols = ", ".join(COLUMNS)
            await conn.execute(text(SQLITE_NEW_TABLE))
            if has_half_day_column:
                await conn.execute(text(f"INSERT INTO attendance_records_new ({target_cols}) SELECT {target_cols} FROM attendance_records"))
            else:
                # Old table has no half_day column yet — select it as an
                # explicit literal NULL, spelled out column-by-column (not
                # sliced) so it can't silently land in the wrong position.
                # Every pre-existing row becomes a normal full-day record
                # (half_day IS NULL), matching what it already was.
                select_exprs = ", ".join("NULL" if c == "half_day" else c for c in COLUMNS)
                await conn.execute(text(
                    f"INSERT INTO attendance_records_new ({target_cols}) "
                    f"SELECT {select_exprs} FROM attendance_records"
                ))
            await conn.execute(text("DROP TABLE attendance_records"))
            await conn.execute(text("ALTER TABLE attendance_records_new RENAME TO attendance_records"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_attendance_employee_id ON attendance_records (employee_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_attendance_date ON attendance_records (date)"))
            print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
