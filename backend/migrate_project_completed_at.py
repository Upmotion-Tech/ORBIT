#!/usr/bin/env python3
"""
Add the projects.completed_at column (nullable, additive).

Set for the "hide Completed projects from the board 20 days after
completion, keep them in Past Projects" feature. Backfills existing
Completed projects with their current updated_at as a best-effort estimate
of when they were completed (exact going forward, approximate for history).

Works against either the local SQLite dev DB (orbit.db) or the Postgres
DATABASE_URL from .env, matching the same fallback logic as app/core/config.py.
Safe to re-run — skips if the column already exists.

Execute from backend directory: python migrate_project_completed_at.py
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
        cols = {row[1] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
        if "completed_at" in cols:
            print("[OK] projects.completed_at already exists — nothing to do.")
        else:
            conn.execute("ALTER TABLE projects ADD COLUMN completed_at TIMESTAMP")
            print("[OK] Added projects.completed_at")

        cursor = conn.execute(
            "UPDATE projects SET completed_at = updated_at WHERE status = 'Completed' AND completed_at IS NULL"
        )
        conn.commit()
        print(f"[OK] Backfilled completed_at for {cursor.rowcount} existing Completed project(s) using updated_at.")
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
            await conn.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ")
            print("[OK] Ensured projects.completed_at exists (Postgres)")
            result = await conn.execute(
                "UPDATE projects SET completed_at = updated_at WHERE status = 'Completed' AND completed_at IS NULL"
            )
            print(f"[OK] Backfilled Completed projects: {result}")
        finally:
            await conn.close()

    asyncio.run(run())
    return 0


def main():
    from dotenv import load_dotenv
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")

    print("=" * 60)
    print("Project completed_at column migration")
    print("=" * 60)

    if database_url and database_url.strip():
        print(f"[INFO] DATABASE_URL is set — migrating Postgres.")
        return migrate_postgres(database_url)
    else:
        print("[INFO] DATABASE_URL is unset — migrating local SQLite (orbit.db).")
        return migrate_sqlite()


if __name__ == "__main__":
    raise SystemExit(main())
