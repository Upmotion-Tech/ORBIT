#!/usr/bin/env python3
"""
Add employees.contract_file_data / employees.contract_file_name (nullable,
additive) — employee contracts now live in Postgres itself instead of local
disk, since Render's filesystem is ephemeral and wipes every uploaded file
on each redeploy (same fix already applied to Policy PDFs, Lead documents,
and Project attachments). The old contract_file_url column is left in place
(unused going forward) rather than dropped, so this stays a pure
additive/reversible migration.

Works against either the local SQLite dev DB (orbit.db) or the Postgres
DATABASE_URL from .env, matching the same fallback logic as app/core/config.py.
Safe to re-run — skips if the columns already exist.

Execute from backend directory: python migrate_employee_contract_data.py
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
        cols = {row[1] for row in conn.execute("PRAGMA table_info(employees)").fetchall()}
        if "contract_file_data" in cols:
            print("[OK] employees.contract_file_data already exists — nothing to do.")
        else:
            conn.execute("ALTER TABLE employees ADD COLUMN contract_file_data BLOB")
            print("[OK] Added employees.contract_file_data")
        if "contract_file_name" in cols:
            print("[OK] employees.contract_file_name already exists — nothing to do.")
        else:
            conn.execute("ALTER TABLE employees ADD COLUMN contract_file_name VARCHAR(255)")
            print("[OK] Added employees.contract_file_name")
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
            await conn.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_file_data BYTEA")
            await conn.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_file_name VARCHAR(255)")
            print("[OK] Ensured employees.contract_file_data / contract_file_name exist (Postgres)")
        finally:
            await conn.close()

    asyncio.run(run())
    return 0


def main():
    from dotenv import load_dotenv
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")

    print("=" * 60)
    print("Employee contract file columns migration")
    print("=" * 60)

    if database_url and database_url.strip():
        print(f"[INFO] DATABASE_URL is set — migrating Postgres.")
        return migrate_postgres(database_url)
    else:
        print("[INFO] DATABASE_URL is unset — migrating local SQLite (orbit.db).")
        return migrate_sqlite()


if __name__ == "__main__":
    raise SystemExit(main())
