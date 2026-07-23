#!/usr/bin/env python3
"""
Add project_attachments.file_data (nullable, additive) — project attachments
now live in Postgres itself instead of local disk, since Render's
filesystem is ephemeral and wipes every uploaded file on each redeploy
(same fix already applied to Policy PDFs and Lead documents). The old `url`
column is left in place (unused going forward) rather than dropped, but its
NOT NULL constraint is lifted (same pattern already used for audit_logs.actor
/ project_comments.author when those moved to their FK counterparts) since
new rows no longer populate it.

Works against either the local SQLite dev DB (orbit.db) or the Postgres
DATABASE_URL from .env, matching the same fallback logic as app/core/config.py.
Safe to re-run — skips if the column already exists.

Execute from backend directory: python migrate_project_attachment_data.py
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
        cols = {row[1] for row in conn.execute("PRAGMA table_info(project_attachments)").fetchall()}
        if "file_data" in cols:
            print("[OK] project_attachments.file_data already exists — nothing to do.")
        else:
            conn.execute("ALTER TABLE project_attachments ADD COLUMN file_data BLOB")
            print("[OK] Added project_attachments.file_data")
        # SQLite doesn't support ALTER COLUMN DROP NOT NULL directly, and the
        # local dev DB is disposable/recreated anyway — not worth the
        # table-rebuild dance here; only Postgres (the real, persistent one)
        # needs this fixed.
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
            await conn.execute("ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS file_data BYTEA")
            await conn.execute("ALTER TABLE project_attachments ALTER COLUMN url DROP NOT NULL")
            print("[OK] Ensured project_attachments.file_data exists and url is nullable (Postgres)")
        finally:
            await conn.close()

    asyncio.run(run())
    return 0


def main():
    from dotenv import load_dotenv
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")

    print("=" * 60)
    print("Project attachment file_data column migration")
    print("=" * 60)

    if database_url and database_url.strip():
        print(f"[INFO] DATABASE_URL is set — migrating Postgres.")
        return migrate_postgres(database_url)
    else:
        print("[INFO] DATABASE_URL is unset — migrating local SQLite (orbit.db).")
        return migrate_sqlite()


if __name__ == "__main__":
    raise SystemExit(main())
