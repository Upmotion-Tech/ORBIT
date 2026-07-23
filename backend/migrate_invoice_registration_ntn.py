#!/usr/bin/env python3
"""
Add invoices.registration_number / invoices.ntn (nullable, additive) — set
per-invoice at creation time, shown on the generated PDF's letterhead.

Works against either the local SQLite dev DB (orbit.db) or the Postgres
DATABASE_URL from .env, matching the same fallback logic as app/core/config.py.
Safe to re-run — skips if the columns already exist.

Execute from backend directory: python migrate_invoice_registration_ntn.py
"""
import os
import re
import sqlite3
from pathlib import Path

os.chdir(Path(__file__).parent)


def migrate_sqlite(db_path="orbit.db"):
    if not os.path.exists(db_path):
        print(f"[ERROR] Database not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    try:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(invoices)").fetchall()}
        for name in ("registration_number", "ntn"):
            if name in cols:
                print(f"[OK] invoices.{name} already exists — nothing to do.")
            else:
                conn.execute(f"ALTER TABLE invoices ADD COLUMN {name} VARCHAR(100)")
                print(f"[OK] Added invoices.{name}")
        conn.commit()
        return 0
    finally:
        conn.close()


def migrate_postgres(database_url: str):
    import asyncio
    import asyncpg

    clean_url = re.sub(r'&?(?:sslmode|channel_binding)=[^&]+', '', database_url.strip()).rstrip('?&')
    clean_url = clean_url.replace("postgresql+asyncpg://", "postgresql://")

    async def run():
        conn = await asyncpg.connect(clean_url, ssl="require")
        try:
            await conn.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100)")
            await conn.execute("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ntn VARCHAR(100)")
            print("[OK] Ensured invoices.registration_number / invoices.ntn exist (Postgres)")
        finally:
            await conn.close()

    asyncio.run(run())
    return 0


def main():
    from dotenv import load_dotenv
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")

    print("=" * 60)
    print("Invoice registration_number/ntn column migration")
    print("=" * 60)

    if database_url and database_url.strip():
        print(f"[INFO] DATABASE_URL is set — migrating Postgres.")
        return migrate_postgres(database_url)
    else:
        print("[INFO] DATABASE_URL is unset — migrating local SQLite (orbit.db).")
        return migrate_sqlite()


if __name__ == "__main__":
    raise SystemExit(main())
