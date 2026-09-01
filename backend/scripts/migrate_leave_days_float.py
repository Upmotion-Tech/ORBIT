"""
Widens leave_requests.days from INTEGER to a real (float/double precision)
column, so a half-day request (see migrate_leave_half_day.py) can actually
store 0.5 there — LeaveService._compute_balance sums .days directly for
casual/sick/annual balance math, so the column has to be able to hold a
fractional value for that to work.

Postgres gets a genuine ALTER COLUMN ... TYPE (safe and non-destructive:
every existing integer value like 1, 2, 5 just becomes 1.0, 2.0, 5.0 — the
USING clause makes that cast explicit rather than relying on an implicit
one Postgres might refuse).

SQLite needs NO change at all here — verified empirically: SQLite's
"INTEGER" is only a type *affinity*, not a strict type, and when a value
would lose information being forced to an integer (like 0.5), SQLite stores
it as REAL instead and reports it back correctly. A column declared INTEGER
in sqlite_master already round-trips 0.5 perfectly today; rebuilding the
table would only change what the schema cosmetically says, not what it does.

Safe to run more than once: checks the live column type first and no-ops if
it's already floating-point (Postgres) or if the dialect is SQLite.

Run from backend/: python -m scripts.migrate_leave_days_float
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine

# Postgres type names that already mean "not a strict integer" — covers
# whatever this migration (or a future manual change) already left behind.
FLOAT_TYPE_NAMES = {"double precision", "real", "numeric", "decimal"}


async def main():
    async with engine.begin() as conn:
        dialect = conn.dialect.name

        if dialect != "postgresql":
            print(f"[OK] {dialect} detected - no schema change needed here "
                  "(SQLite's INTEGER affinity already stores 0.5 correctly).")
            return

        current_type = await conn.run_sync(
            lambda sync_conn: next(
                (str(c["type"]).lower() for c in inspect(sync_conn).get_columns("leave_requests") if c["name"] == "days"),
                None,
            )
        )
        if current_type is None:
            print("[OK] leave_requests.days column not found - nothing to do.")
            return
        if any(name in current_type for name in FLOAT_TYPE_NAMES):
            print(f"[OK] leave_requests.days is already {current_type} - nothing to do.")
            return

        print(f"[OK] Widening leave_requests.days from {current_type} to double precision ...")
        await conn.execute(text(
            "ALTER TABLE leave_requests ALTER COLUMN days TYPE DOUBLE PRECISION USING days::double precision"
        ))
        print("[OK] Migration complete.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
