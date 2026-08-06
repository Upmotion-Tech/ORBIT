"""
Drops the wfh_requests (employee_id, date) unique constraint.

Why: it made a REJECTED work-from-home request permanently burn its dates —
re-applying for the same day failed with a raw IntegrityError (a 500), even
though WfhRequestService deliberately ignores rejected requests when
checking for overlaps. The constraint also only ever covered the START day,
so once requests could span a range it never actually prevented two ranges
overlapping on their later days either. The real rule now lives in
WfhRequestService.create_request/update_own_request via
find_overlapping_for_employee (blocks Pending/Approved overlaps, ignores
Rejected).

Safe to run more than once: checks first and no-ops if the constraint is
already gone. No rows are read, changed, or deleted on the Postgres path.

Postgres gets a plain ALTER TABLE ... DROP CONSTRAINT. SQLite has no such
statement at all, so there it rebuilds the table (create without the
constraint -> copy every row -> drop old -> rename), which is the standard
SQLite approach and is why this runs inside a transaction.

Run from backend/: python -m scripts.migrate_wfh_drop_unique
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine

CONSTRAINT_NAME = "uq_wfh_employee_date"

# Column order must match the current WfhRequest model. Used only on the
# SQLite rebuild path.
COLUMNS = [
    "id", "employee_id", "date", "end_date", "description", "status",
    "decision_note", "decided_by", "decided_at", "created_at", "updated_at",
]

SQLITE_NEW_TABLE = """
CREATE TABLE wfh_requests_new (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL REFERENCES employees (id),
    date DATE NOT NULL,
    end_date DATE,
    description TEXT,
    status VARCHAR(20) NOT NULL,
    decision_note TEXT,
    decided_by VARCHAR(255),
    decided_at DATETIME,
    created_at DATETIME,
    updated_at DATETIME
)
"""


async def _has_constraint(conn) -> bool:
    def _check(sync_conn):
        insp = inspect(sync_conn)
        if "wfh_requests" not in insp.get_table_names():
            return None  # table itself missing
        names = {uc.get("name") for uc in insp.get_unique_constraints("wfh_requests")}
        # SQLite reports an unnamed unique index for this in some versions,
        # so fall back to matching the column pair rather than the name.
        cols = [tuple(uc.get("column_names") or []) for uc in insp.get_unique_constraints("wfh_requests")]
        return CONSTRAINT_NAME in names or ("employee_id", "date") in cols

    return await conn.run_sync(_check)


async def main():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        present = await _has_constraint(conn)

        if present is None:
            print("[OK] wfh_requests table does not exist yet - nothing to do "
                  "(create_all will build it without the constraint).")
            return
        if not present:
            print(f"[OK] {CONSTRAINT_NAME} is already gone - nothing to do.")
            return

        if dialect == "postgresql":
            print(f"[OK] Dropping {CONSTRAINT_NAME} ...")
            await conn.execute(text(f"ALTER TABLE wfh_requests DROP CONSTRAINT IF EXISTS {CONSTRAINT_NAME}"))
        else:
            # SQLite: no DROP CONSTRAINT, so rebuild the table without it.
            print(f"[OK] SQLite detected - rebuilding wfh_requests without {CONSTRAINT_NAME} ...")
            cols = ", ".join(COLUMNS)
            await conn.execute(text(SQLITE_NEW_TABLE))
            await conn.execute(text(f"INSERT INTO wfh_requests_new ({cols}) SELECT {cols} FROM wfh_requests"))
            await conn.execute(text("DROP TABLE wfh_requests"))
            await conn.execute(text("ALTER TABLE wfh_requests_new RENAME TO wfh_requests"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wfh_employee_id ON wfh_requests (employee_id)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_wfh_status ON wfh_requests (status)"))

        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
