# CLAUDE.md — Authoritative Developer & Agent Reference Guide for ORBIT

**ORBIT** (Operational Revenue & Business Intelligence Tool) is the internal ERP / Professional Services Operating System built for **Upmotion Tech**.

This document is the authoritative reference guide for AI agents and human developers working on this codebase.

---

## 1. Stack & Infrastructure

- **Backend**: Python 3.11+ / FastAPI (Async)
- **ORM**: SQLAlchemy 2.x (Async with `asyncpg` for Postgres, `aiosqlite` for SQLite)
- **Validation**: Pydantic v2
- **Database (Production)**: Neon PostgreSQL (`postgresql+asyncpg://...`)
- **Database (Development)**: SQLite (`sqlite+aiosqlite:///./orbit.db`, zero-config fallback when `DATABASE_URL` is unset)
- **Authentication**: JWT tokens (`python-jose`) + `bcrypt` password hashing
- **Timezone**: Pakistan Standard Time (PKT, `Asia/Karachi`, fixed UTC+05:00, no DST)
- **Frontend**: Single SPA bundle (`ORBIT.html`, `backend/static/index.html`, `frontend/index.html`)

---

## 2. Directory & Architecture Layout

The codebase follows a strict clean architecture:

```
Orbit/
├── unpacked/                     # EDITABLE FRONTEND SOURCE FILES
│   ├── template.html             # Main HTML layout, CSS design system, & component templates
│   ├── script.js                 # App state, API client methods, event handlers, & renderVals()
│   └── sync_script.py            # Utility script to inject script.js into template.html
├── pack.py                       # Repackages unpacked/template.html into the 3 bundle locations
├── ORBIT.html                    # Root SPA bundle copy
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app initialization, CORS, router registration, lifespan startup
│   │   ├── core/                 # Config, DB session (`get_db`), security (`JWT/bcrypt`), PKT time, dependencies
│   │   ├── models/               # SQLAlchemy ORM models (one file per table)
│   │   ├── schemas/              # Pydantic v2 schemas (request inputs & response models)
│   │   ├── repositories/         # Raw SQLAlchemy async queries (Routers/Services never touch DB directly)
│   │   ├── services/             # Core business logic, RBAC checks, validation, audit logging
│   │   ├── routers/              # Thin FastAPI route handlers mapping HTTP verbs to service methods
│   │   ├── storage/              # Physical storage directory for uploaded attachments
│   │   └── templates/            # Invoice DOCX templates for PDF generation
│   ├── static/index.html         # Bundle copy served by FastAPI at "/"
│   └── scripts/                  # DB seed & cleanup scripts
└── frontend/
    ├── index.html                # Bundle copy deployed to Vercel
    └── vercel.json               # Vercel proxy rewrite config (/api/* -> Render backend)
```

---

## 3. Mandatory Frontend Editing & Repackaging Workflow

> [!IMPORTANT]
> Never edit `ORBIT.html`, `backend/static/index.html`, or `frontend/index.html` directly!
> Always edit the source files inside the `unpacked/` directory, then execute the repackaging pipeline.

### Step-by-Step Frontend Workflow:
1. **Edit Source Files**: Make your UI / JS edits in `unpacked/script.js` or `unpacked/template.html`.
2. **Check JS Syntax**:
   ```bash
   node --check unpacked/script.js
   ```
3. **Sync Script into Template**:
   ```bash
   python unpacked/sync_script.py
   ```
4. **Verify Tag Balance** (in `unpacked/` directory):
   ```bash
   python -c "import re; tpl=open('template.html', encoding='utf-8').read(); print('sc-if:', len(re.findall(r'<sc-if\b', tpl)), '/', len(re.findall(r'</sc-if>', tpl))); print('sc-for:', len(re.findall(r'<sc-for\b', tpl)), '/', len(re.findall(r'</sc-for>', tpl)))"
   ```
5. **Repackage Bundle**:
   ```bash
   python pack.py
   ```
   *(This updates `ORBIT.html`, `backend/static/index.html`, and `frontend/index.html` simultaneously while safely escaping `<\/script` tags).*

---

## 4. Time & Timezone Standard (PKT UTC+05:00)

ORBIT standardizes on **Pakistan Standard Time (`Asia/Karachi`, fixed UTC+05:00, no DST)**. Never use UTC or client local time.

- **Backend**: Use `app.core.time.now_pkt()` instead of `datetime.now()`. All Pydantic response schemas with datetime fields normalize output timestamps to PKT offset (`+05:00`) via `to_pkt()` validator.
- **Frontend**: Dates and times format using `timeZone: 'Asia/Karachi'` (`PKT_TZ`). Calendar filters and overdue calculations use `todayISO()` (PKT date).

---

## 5. Authentication, RBAC & Scoping Rules

### Multi-Select Access Levels
Access levels are stored as a list on the employee record (`access_levels` JSON/array):
`"owner"`, `"dashboard"`, `"crm"`, `"dev"`, `"finance"`, `"hr"`, `"permissions"`, `"customers"`, `"employee"`.

- **Live Role Refresh**: `get_current_user` in `app/core/dependencies.py` dynamically refreshes `payload["roles"]` and `payload["department"]` from the database on **every API request**. Permission updates take effect instantly without user re-login.
- **Module Permissions**:
  - **Finance**: Gated by `get_finance_user` (`owner` or `finance`).
  - **CRM**: Gated by `get_crm_editor_user` (`owner` or `crm`).
  - **Setup / Audit Trail**: Gated by `get_audit_user` (`owner` or `permissions`).
- **Dev Member Project & Task Scoping**:
  - Controlled by `is_dev_member(roles, department)` in `app/core/permissions.py` (returns `True` if `department == "Dev Member"` and not `owner`).
  - **Projects (`list_projects` / `get_project`)**: Dev Member department engineers ONLY see projects where their `user_id` is present in `project.team_ids`. Direct GET requests for unassigned projects raise `403 Forbidden`.
  - **Tasks (`list_tasks` / `get_task`)**: Dev Member department engineers ONLY see tasks assigned to them directly (`assignee_id == user_id`) OR tasks belonging to projects where they are in `team_ids`.

---

## 6. Database & Persistence Mechanics

- **Environment Switching**: `DATABASE_URL` specifies the database. Unset → SQLite (`orbit.db`). Set → PostgreSQL (Neon).
- **No Trailing Slashes on API Routes**: FastAPI routes must be registered without trailing slashes (e.g. `/api/audit`, `/api/projects`). Trailing slashes trigger HTTP 307 redirects across CORS boundaries which strip the `Authorization` header.
- **Schema & Pydantic Schema Alignment**:
  - `AuditLogResponse.actor_id` is `Optional[str] = None` to support legacy or system-level audit records where `actor_id` is null.
  - Legacy NOT NULL constraints on live Postgres columns (`audit_logs.actor`, `project_comments.author`, `projects.team`) have been dropped (`DROP NOT NULL`) in favor of their FK counterparts (`actor_id`, `author_id`, `team_ids`).
- **CRM Lead Activity Fixes**:
  - Fixed Pydantic `ValidationError` on `GET /api/audit`: updated `AuditLogResponse.actor_id` in `app/schemas/audit_log.py` to `Optional[str] = None` to support legacy/system audit records where `actor_id` is null.
  - Fixed CRM Lead Activity and Comments user display: updated `activityToDisplay(a)` in `unpacked/script.js` to resolve employee UUID (`a.created_by`) into the employee's real name via `getEmployeeName(a.created_by)` instead of displaying raw UUIDs.
- **Account Hard Deletion Cascade**:
  - `EmployeeRepository.hard_delete_with_related_data()` safely handles permanent account deletion by:
    1. Setting nullable FK references to `NULL` (`Task.assignee_id`, `Task.created_by_id`, `Project.created_by_id`, `Customer.created_by_id`, `LeaveRequest.approved_by_id`).
    2. Deleting related records in `AttendanceRecord`, `WfhRequest`, `AuditLog`, `ProjectComment`, `LeaveRequest`, `SalarySlip`, `Expense`, and `Notification`.
    3. Deleting the `Employee` row cleanly without foreign key constraint errors.

---

## 7. Operational Checklist & Commands

### Running Backend Locally
```bash
cd backend
uvicorn app.main:app --reload
```

### Direct Backend & DB Verification
When testing database operations or services, run a quick Python async script against `DATABASE_URL`:
```bash
python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()
raw_url = os.getenv('DATABASE_URL')
clean_url = raw_url.split('?')[0]
db_url = clean_url.replace('postgresql://', 'postgresql+asyncpg://')

async def test():
    engine = create_async_engine(db_url, connect_args={'ssl': 'require'})
    async_session = sessionmaker(engine, class_=AsyncSession)
    async with async_session() as session:
        print('Connected successfully!')
    await engine.dispose()

asyncio.run(test())
"
```
