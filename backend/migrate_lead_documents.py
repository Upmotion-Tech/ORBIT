#!/usr/bin/env python3
"""
Add leads.scope_document_data/scope_document_filename/signed_contract_data/
signed_contract_filename (nullable, additive) — lead documents now live in
Postgres itself instead of local disk, since Render's filesystem is
ephemeral and wipes every uploaded file on each redeploy (same fix already
applied to Policy PDFs). The old scope_document_url/signed_contract_url
columns are left in place (unused going forward) rather than dropped, so
this stays a pure additive/reversible migration.

Works against either the local SQLite dev DB (orbit.db) or the Postgres
DATABASE_URL from .env, matching the same fallback logic as app/core/config.py.
Safe to re-run — skips if the columns already exist.

Execute from backend directory: python migrate_lead_documents.py
"""
import os
import re
import sqlite3
from pathlib import Path

os.chdir(Path(__file__).parent)

NEW_COLUMNS = [
    ("scope_document_data", "BLOB", "BYTEA"),
    ("scope_document_filename", "VARCHAR(255)", "VARCHAR(255)"),
    ("signed_contract_data", "BLOB", "BYTEA"),
    ("signed_contract_filename", "VARCHAR(255)", "VARCHAR(255)"),
]


def migrate_sqlite(db_path="orbit.db"):
    if not os.path.exists(db_path):
        print(f"[ERROR] Database not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    try:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(leads)").fetchall()}
        for name, sqlite_type, _ in NEW_COLUMNS:
            if name in cols:
                print(f"[OK] leads.{name} already exists — nothing to do.")
            else:
                conn.execute(f"ALTER TABLE leads ADD COLUMN {name} {sqlite_type}")
                print(f"[OK] Added leads.{name}")
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
            for name, _, pg_type in NEW_COLUMNS:
                await conn.execute(f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS {name} {pg_type}")
            print("[OK] Ensured all leads document columns exist (Postgres)")
        finally:
            await conn.close()

    asyncio.run(run())
    return 0


def main():
    from dotenv import load_dotenv
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")

    print("=" * 60)
    print("Lead document columns migration")
    print("=" * 60)

    if database_url and database_url.strip():
        print(f"[INFO] DATABASE_URL is set — migrating Postgres.")
        return migrate_postgres(database_url)
    else:
        print("[INFO] DATABASE_URL is unset — migrating local SQLite (orbit.db).")
        return migrate_sqlite()


if __name__ == "__main__":
    raise SystemExit(main())
