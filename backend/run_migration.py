#!/usr/bin/env python3
"""
Run database migration to add employee ID columns and backfill data.
Execute from backend directory: python run_migration.py
"""
import os
import sys
import sqlite3
import json
from pathlib import Path

# Change to backend directory
os.chdir(Path(__file__).parent)

# SQLite database path
DB_PATH = "orbit.db"

def connect_db():
    """Connect to SQLite database"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def table_has_column(conn, table, column):
    """Check if table has column"""
    cursor = conn.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cursor.fetchall()}
    return column in columns

def migrate_name_to_id(conn, table, old_col, new_col):
    """Migrate a string column from employee name to employee ID"""
    print(f"  Migrating {table}.{old_col} → {new_col}...")

    if table_has_column(conn, table, new_col):
        print(f"    [OK] {new_col} already exists")
    else:
        print(f"    [OK] Creating {new_col} column")
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {new_col} VARCHAR(36)")

    # Backfill from employee names
    cursor = conn.execute(f"""
        UPDATE {table}
        SET {new_col} = (
            SELECT id FROM employees WHERE name = {table}.{old_col}
        )
        WHERE {old_col} IS NOT NULL AND {new_col} IS NULL
    """)

    print(f"    [OK] Backfilled {cursor.rowcount} rows")

def migrate_project_team(conn):
    """Special handling for project team - convert array of names to array of IDs"""
    print(f"  Migrating projects.team (name array -> ID array)...")

    # Ensure team_ids column exists
    if not table_has_column(conn, "projects", "team_ids"):
        conn.execute("ALTER TABLE projects ADD COLUMN team_ids TEXT")

    # Get all projects
    cursor = conn.execute("SELECT id, team FROM projects WHERE team IS NOT NULL")
    projects = cursor.fetchall()

    updated = 0
    for proj in projects:
        proj_id, team_json = proj
        if not team_json:
            continue

        try:
            names = json.loads(team_json)
            if not isinstance(names, list):
                continue
        except:
            continue

        # Convert names to IDs
        ids = []
        for name in names:
            emp_cursor = conn.execute(
                "SELECT id FROM employees WHERE name = ?",
                (name,)
            )
            emp = emp_cursor.fetchone()
            if emp:
                ids.append(emp[0])

        # Update team_ids
        if ids:
            conn.execute(
                "UPDATE projects SET team_ids = ? WHERE id = ?",
                (json.dumps(ids), proj_id)
            )
            updated += 1

    print(f"    [OK] Converted {updated} project teams to employee IDs")

def main():
    print("=" * 60)
    print("Employee ID Migration")
    print("=" * 60)

    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found: {DB_PATH}")
        return 1

    conn = connect_db()

    try:
        print(f"\n[OK] Connected to {DB_PATH}")

        # Check if employees table exists and has records
        emp_cursor = conn.execute("SELECT COUNT(*) FROM employees")
        emp_count = emp_cursor.fetchone()[0]
        print(f"[OK] Found {emp_count} employees")

        if emp_count == 0:
            print("[ERROR] No employees found! Cannot migrate.")
            return 1

        # Migrate each field
        migrations = [
            ("tasks", "assignee", "assignee_id"),
            ("tasks", "created_by", "created_by_id"),
            ("tasks", "updated_by", "updated_by_id"),
            ("projects", "created_by", "created_by_id"),
            ("projects", "updated_by", "updated_by_id"),
            ("audit_logs", "actor", "actor_id"),
            ("project_comments", "author", "author_id"),
            ("leave_requests", "approved_by", "approved_by_id"),
            ("salary_slips", "created_by", "created_by_id"),
            ("salary_slips", "updated_by", "updated_by_id"),
        ]

        for table, old_col, new_col in migrations:
            try:
                migrate_name_to_id(conn, table, old_col, new_col)
            except Exception as e:
                print(f"    [ERROR] {e}")
                continue

        # Special: project team array
        try:
            migrate_project_team(conn)
        except Exception as e:
            print(f"    [ERROR] Error migrating project teams: {e}")

        conn.commit()
        print("\n" + "=" * 60)
        print("[OK] Migration complete!")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Start the backend: uvicorn app.main:app --reload")
        print("2. Update services/repositories to use new ID columns")
        print("3. Update frontend to send IDs instead of names")
        return 0

    except Exception as e:
        print(f"\n[ERROR] Migration failed: {e}")
        import traceback
        traceback.print_exc()
        conn.rollback()
        return 1
    finally:
        conn.close()

if __name__ == "__main__":
    sys.exit(main())
