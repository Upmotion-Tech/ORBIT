#!/usr/bin/env python3
"""Verify the migration worked"""
import sqlite3
import os

DB_PATH = "orbit.db"

def check_column(conn, table, column):
    cursor = conn.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cursor.fetchall()}
    return column in columns

conn = sqlite3.connect(DB_PATH)

print("Checking migration results...")
print()

# Check tasks
print("Tasks table columns:")
checks = [
    ("tasks", "assignee_id"),
    ("tasks", "created_by_id"),
    ("tasks", "updated_by_id"),
    ("projects", "team_ids"),
    ("projects", "created_by_id"),
    ("projects", "updated_by_id"),
    ("audit_logs", "actor_id"),
    ("project_comments", "author_id"),
    ("leave_requests", "approved_by_id"),
    ("salary_slips", "created_by_id"),
    ("salary_slips", "updated_by_id"),
]

for table, column in checks:
    has_col = check_column(conn, table, column)
    status = "[OK]" if has_col else "[MISSING]"
    print(f"  {status} {table}.{column}")

# Count backfilled rows
print()
print("Backfill counts:")
for table, column in [
    ("tasks", "assignee_id"),
    ("projects", "team_ids"),
    ("audit_logs", "actor_id"),
]:
    cursor = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {column} IS NOT NULL")
    count = cursor.fetchone()[0]
    print(f"  {table}.{column}: {count} rows backfilled")

conn.close()
print()
print("[OK] Migration verification complete!")
