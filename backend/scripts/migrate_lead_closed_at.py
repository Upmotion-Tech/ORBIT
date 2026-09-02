"""
Adds leads.closed_at (nullable timestamptz) — the server-set moment a lead
entered a terminal stage (Won/Lost).

Why: the CRM board now keeps a closed lead visible for 20 days after it
closes and only then drops it into Past Leads (see LEAD_STALE_DAYS in
frontend-next/src/app/crm/page.tsx), which needs a trustworthy "when did
this actually close" timestamp. The existing actual_closure_date is a
user-editable Date in the lead drawer — blank, backdated or edited at will —
and updated_at moves on every edit, so neither can drive that window. This
is the direct counterpart of projects.completed_at, which already does the
same job for the 20-day Past Projects rule.

Existing rows: every pre-existing lead gets closed_at = NULL, which the
frontend treats as "closed at an unknown time, therefore long ago" — so
today's Won/Lost leads stay in Past Leads exactly where they already appear,
and only newly-closed leads get the 20-day board window. Deliberately NOT
backfilled from actual_closure_date: any lead carrying a recent date there
would otherwise leap back onto the live pipeline board on deploy.

Safe to run more than once: checks for the column first and no-ops if it's
already present. Adding a nullable column is non-destructive and needs no
table rewrite on either dialect.

Run from backend/: python -m scripts.migrate_lead_closed_at
"""
import asyncio

from sqlalchemy import inspect, text

from app.core.database import engine

# Postgres wants TIMESTAMPTZ to match DateTime(timezone=True); SQLite has no
# real timestamp type and treats DATETIME as a string affinity, same as every
# other datetime column in this schema already does locally.
COLUMN_DDL = {
    "postgresql": "ALTER TABLE leads ADD COLUMN closed_at TIMESTAMPTZ",
    "sqlite": "ALTER TABLE leads ADD COLUMN closed_at DATETIME",
}


async def main():
    async with engine.begin() as conn:
        dialect = conn.dialect.name
        existing_columns = await conn.run_sync(
            lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("leads")}
        )

        if "closed_at" in existing_columns:
            print("[OK] leads.closed_at already exists - nothing to do.")
        else:
            ddl = COLUMN_DDL.get(dialect, COLUMN_DDL["sqlite"])
            print(f"[OK] {dialect} detected - adding leads.closed_at ...")
            await conn.execute(text(ddl))
            print("[OK] Migration complete.")

        # Report, don't touch: confirms the column is readable and shows how
        # many closed leads are (correctly) left with a NULL closed_at.
        total = await conn.execute(text("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL"))
        terminal = await conn.execute(text(
            "SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND stage IN ('Won', 'Lost')"
        ))
        stamped = await conn.execute(text(
            "SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND closed_at IS NOT NULL"
        ))
        print(
            f"[INFO] leads: {total.scalar()} live, "
            f"{terminal.scalar()} in Won/Lost, {stamped.scalar()} with closed_at set "
            "(pre-existing closed leads stay NULL by design -> they remain in Past Leads)."
        )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
