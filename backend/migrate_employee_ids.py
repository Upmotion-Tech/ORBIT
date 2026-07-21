#!/usr/bin/env python3
"""
Migrate from employee name/email references to employee_id.
This script adds new columns, backfills data from employee records,
and marks old columns for removal.
"""
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Get database URL from environment or use default
DATABASE_URL = "sqlite+aiosqlite:///./orbit.db"

async def migrate():
    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # List all migrations to perform
        migrations = [
            # Task.assignee → Task.assignee_id
            {
                "table": "tasks",
                "old_col": "assignee",
                "new_col": "assignee_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # Task.created_by → Task.created_by_id
            {
                "table": "tasks",
                "old_col": "created_by",
                "new_col": "created_by_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # Task.updated_by → Task.updated_by_id
            {
                "table": "tasks",
                "old_col": "updated_by",
                "new_col": "updated_by_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # Project.created_by → Project.created_by_id
            {
                "table": "projects",
                "old_col": "created_by",
                "new_col": "created_by_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # Project.updated_by → Project.updated_by_id
            {
                "table": "projects",
                "old_col": "updated_by",
                "new_col": "updated_by_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # AuditLog.actor → AuditLog.actor_id
            {
                "table": "audit_logs",
                "old_col": "actor",
                "new_col": "actor_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # ProjectComment.author → ProjectComment.author_id
            {
                "table": "project_comments",
                "old_col": "author",
                "new_col": "author_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # LeaveRequest.approved_by → LeaveRequest.approved_by_id
            {
                "table": "leave_requests",
                "old_col": "approved_by",
                "new_col": "approved_by_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # SalarySlip.created_by → SalarySlip.created_by_id
            {
                "table": "salary_slips",
                "old_col": "created_by",
                "new_col": "created_by_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
            # SalarySlip.updated_by → SalarySlip.updated_by_id
            {
                "table": "salary_slips",
                "old_col": "updated_by",
                "new_col": "updated_by_id",
                "lookup_table": "employees",
                "lookup_col": "name",
            },
        ]

        for migration in migrations:
            await migrate_column(session, migration)

        # Special case: Project.team (JSON array of names → JSON array of IDs)
        await migrate_project_team(session)

        await session.commit()
        print("\n✓ Migration complete!")

async def migrate_column(session, config):
    table = config["table"]
    old_col = config["old_col"]
    new_col = config["new_col"]
    lookup_table = config["lookup_table"]
    lookup_col = config["lookup_col"]

    print(f"\nMigrating {table}.{old_col} → {new_col}...")

    # Check if columns exist
    inspector = inspect(await session.connection())
    columns = [c['name'] for c in inspector.get_columns(table)]

    if new_col in columns:
        print(f"  ✓ {new_col} already exists, backfilling...")
    else:
        # Create new column
        await session.execute(text(f"""
            ALTER TABLE {table}
            ADD COLUMN {new_col} VARCHAR(36)
        """))
        print(f"  ✓ Created {new_col} column")

    # Backfill data
    await session.execute(text(f"""
        UPDATE {table}
        SET {new_col} = (
            SELECT id FROM {lookup_table}
            WHERE {lookup_col} = {table}.{old_col}
        )
        WHERE {old_col} IS NOT NULL
          AND {new_col} IS NULL
    """))

    result = await session.execute(text(f"SELECT COUNT(*) as cnt FROM {table} WHERE {new_col} IS NOT NULL"))
    count = (await result.first())[0]
    print(f"  ✓ Backfilled {count} rows")

async def migrate_project_team(session):
    """Special handling for Project.team JSON array"""
    print(f"\nMigrating projects.team (JSON array of names → JSON array of IDs)...")

    # Get all projects with teams
    result = await session.execute(text("SELECT id, team FROM projects WHERE team IS NOT NULL"))
    projects = await result.fetchall()

    for proj_id, team_json in projects:
        if not team_json:
            continue

        # Parse JSON array of names
        import json
        try:
            names = json.loads(team_json) if isinstance(team_json, str) else team_json
            if not isinstance(names, list):
                continue
        except:
            continue

        # Look up each name's ID
        ids = []
        for name in names:
            id_result = await session.execute(
                text("SELECT id FROM employees WHERE name = :name LIMIT 1"),
                {"name": name}
            )
            emp_id = id_result.scalar()
            if emp_id:
                ids.append(emp_id)

        # Update with ID array
        if ids:
            import json
            ids_json = json.dumps(ids)
            await session.execute(
                text("UPDATE projects SET team = :team WHERE id = :id"),
                {"team": ids_json, "id": proj_id}
            )

    print(f"  ✓ Converted team arrays to employee IDs")

if __name__ == "__main__":
    asyncio.run(migrate())
