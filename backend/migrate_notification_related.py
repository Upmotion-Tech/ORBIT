#!/usr/bin/env python3
"""
Add notifications.related_type / notifications.related_id (nullable, additive).

Lets the frontend deep-link a notification straight to the task/project/etc.
it's about instead of doing nothing on click. Existing rows are left with
both columns NULL — they fall back to a plain type-based route client-side.

Works against either the local SQLite dev DB (orbit.db) or the Postgres
DATABASE_URL from .env, matching the same fallback logic as app/core/config.py.
Safe to re-run — skips if the columns already exist.

Execute from backend directory: python migrate_notification_related.py
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
        cols = {row[1] for row in conn.execute("PRAGMA table_info(notifications)").fetchall()}
        if "related_type" in cols:
            print("[OK] notifications.related_type already exists — nothing to do.")
        else:
            conn.execute("ALTER TABLE notifications ADD COLUMN related_type VARCHAR(50)")
            print("[OK] Added notifications.related_type")
        if "related_id" in cols:
            print("[OK] notifications.related_id already exists — nothing to do.")
        else:
            conn.execute("ALTER TABLE notifications ADD COLUMN related_id VARCHAR(36)")
            print("[OK] Added notifications.related_id")
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
            await conn.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_type VARCHAR(50)")
            await conn.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id VARCHAR(36)")
            print("[OK] Ensured notifications.related_type / related_id exist (Postgres)")
        finally:
            await conn.close()

    asyncio.run(run())
    return 0


def main():
    from dotenv import load_dotenv
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")

    print("=" * 60)
    print("Notification related_type/related_id column migration")
    print("=" * 60)

    if database_url and database_url.strip():
        print(f"[INFO] DATABASE_URL is set — migrating Postgres.")
        return migrate_postgres(database_url)
    else:
        print("[INFO] DATABASE_URL is unset — migrating local SQLite (orbit.db).")
        return migrate_sqlite()


if __name__ == "__main__":
    raise SystemExit(main())
