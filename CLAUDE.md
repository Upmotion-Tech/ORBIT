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
- **Authentication**: JWT tokens (`python-jose`) + `bcrypt` password hashing (hashing/verification run off the event loop via `asyncio.to_thread` — see `app/core/security.py`)
- **Timezone**: Pakistan Standard Time (PKT, `Asia/Karachi`, fixed UTC+05:00, no DST)
- **Frontend**: Next.js (App Router) + TypeScript, in `frontend-next/`. This is the **only** frontend in this repo — the original single-file HTML SPA bundle (`ORBIT.html`, `unpacked/`, `pack.py`, `frontend/`) has been retired and deleted. `backend/`'s own `/` route is now a plain API-info JSON response; the frontend is a separate app deployed independently (Vercel).

---

## 2. Directory & Architecture Layout

```
Orbit/
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app initialization, CORS, router registration, lifespan startup
│   │   ├── core/                 # Config, DB session (`get_db`), security (`JWT/bcrypt`), PKT time, dependencies
│   │   ├── models/                # SQLAlchemy ORM models (one file per table)
│   │   ├── schemas/               # Pydantic v2 schemas (request inputs & response models)
│   │   ├── repositories/          # Raw SQLAlchemy async queries (Routers/Services never touch DB directly)
│   │   ├── services/              # Core business logic, RBAC checks, validation, audit logging
│   │   ├── routers/                # Thin FastAPI route handlers mapping HTTP verbs to service methods
│   │   ├── storage/                # Physical storage directory for uploaded attachments
│   │   └── templates/              # (legacy — see §3, invoice PDF no longer uses this)
│   └── scripts/                   # DB seed & cleanup scripts
└── frontend-next/                 # THE frontend — Next.js (App Router) + TypeScript
    ├── src/app/                   # One route per screen (page.tsx), root layout, globals.css
    ├── src/components/            # Shell (sidebar/topbar), auth screens
    ├── src/design-system/         # De-globalized compiled UI component bundle (Button, Input, Select, etc.)
    └── src/lib/                   # orbit-client.js (API layer), auth/app-data/toast contexts
```

For a full file-by-file breakdown of `frontend-next/` (what's where, why, known intentional deviations, TypeScript gotchas, verification workflow) see [`frontend-next/CLAUDE.md`](frontend-next/CLAUDE.md) and [`frontend-next/README.md`](frontend-next/README.md). Read those before making frontend changes.

---

## 3. Frontend — `frontend-next/`

There used to be a second, older frontend here: a single-file HTML SPA bundle (`ORBIT.html` / `backend/static/index.html` / `frontend/index.html`) built from `unpacked/template.html` + `unpacked/script.js` via `pack.py`, with its own proprietary template-tag runtime (`sc-if`, `sc-for`, `x-import`, `{{ }}` interpolation). It has been **fully retired and deleted** — `frontend-next/` (Next.js, real routing, ordinary React/TSX) is now the only frontend, ported screen-for-screen from that original bundle. If you find a reference to `unpacked/`, `pack.py`, or `ORBIT.html` anywhere (an old comment, a stale doc, your own training assumptions) — it's stale; those files and the workflow around them no longer exist in this repo.

### Running it locally
```bash
# Terminal 1 — backend (from repo root)
cd backend
uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend-next
npm run dev
# http://localhost:3000, proxies /api/* to http://localhost:8000 (see next.config.ts)
```

### Things worth knowing before touching this code
- Per an explicit decision made during the migration, **pre-existing UI/code duplication in the original app was preserved on purpose** (3 separate Kanban implementations, 6 near-identical search/highlight patterns, duplicated New-vs-Existing forms in CRM/HR/Setup). Don't consolidate it unless asked.
- Three sub-features that existed in the original but were disabled there (User Management tab, Permissions matrix tab, Holiday Calendar panel) are likewise **excluded** here, matching that same UX decision — not omissions.
- `frontend-next/src/lib/app-data-context.tsx` holds cross-page shared state, including `crmStagesList` — CRM pipeline stages have no backend table; they're in-memory only and reset on a full reload, by design (see `frontend-next/CLAUDE.md` for why this needed a shared context rather than local page state).
- Kanban boards (CRM leads, Dev projects, Dev tasks) support real drag-and-drop between columns in addition to the inline status `<select>` — dropping a card just calls the exact same status-change function the dropdown already used, so every existing permission rule and validation gate (e.g. CRM's Won-stage attachment gate, sequential-stage guard) still applies.
- Deep-linking: every lead/project/task/customer/employee card or "View" link is a real `<a href="#/type/id">` (see `deepLinkHref`/`parseDeepLinkHash`/`clearDeepLinkHash` in `orbit-client.js`) — this is what makes right-click/ctrl-click/middle-click "open in new tab" work, and it's also how the topbar Universal Search opens a result: navigate to the owning page with that hash, and a mount effect on that page reads the hash and opens the right drawer.

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
    - **Projects (`list_projects` / `get_project` / `update_project`)**: Dev Member department engineers ONLY see projects where their `user_id` is present in `project.team_ids`. Direct GET requests for unassigned projects raise `403 Forbidden`. Dev Members assigned to a project can update its `status` via the project status dropdown (or by dragging its card — see §3), while attempts to update other fields (budget, name, client, team_ids) are blocked with `403 Forbidden`.
    - **Tasks (`list_tasks` / `get_task` / `create_task` / `update_task`)**: Dev Members assigned to a project (`user_id in project.team_ids`) can create subtasks/tasks under that project. Dev Members can change the **status** of any assigned task. However, editing task details (title, description, deadline, assignee) is restricted to tasks **created by themselves** (`task.created_by_id == user_id`); attempts to edit details of tasks created by the Owner are blocked with `403 Forbidden`.
    - **Drawer Audit Logs (`GET /api/projects/{id}/audit` & `GET /api/tasks/{id}/audit`)**: Project Details Drawer and Task Details Drawer include an **Audit Log** section showing a live chronological activity log (actor name, timestamp, action, and detailed changes) for that specific project or task.
    - **Strict Direct-Report Filtering in Manager Hub**: The **Manager Hub** sidebar section and its Leave/WFH requests table and Attendance overview are strictly filtered to employees whose `manager` profile field matches the logged-in user (`employee.manager == currentUser.name`). A user (including Owners) only sees the Manager Hub item and direct reports if they are explicitly designated as the manager of at least one employee. This check runs off the `employees` list regardless of the viewer's own persona — a Dev Member who happens to manage people still gets a real pending count, not just the sidebar item with nothing behind it.
    - **Leave/WFH approval moved to managers**: HR no longer has Approve/Reject on the Leave Requests tab (or the Attendance tab's WFH list) — those views are read-only for HR now (status, reason, and once decided, who approved/rejected and their note). Approval/rejection happens exclusively through the employee's manager via Manager Hub. A "Leave/WFH Submitted" notification goes to that specific manager (resolved via `EmployeeRepository.find_by_exact_name`), not broadcast to every Owner-department/HR person — it only falls back to an "owner" broadcast if the employee has no manager on file.
    - **Purely Dynamic HR Access (`hr` Token)**: Sidebar section **HR → Employees** and employee management APIs are dynamically controlled by the `hr` access level token (or `owner`). Ticking the **Employees** (`hr`) access level checkbox grants employee details viewing, adding new employees, and updating profile info. Unticking it dynamically removes **HR** from the sidebar and revokes access. Modifying `access_levels` remains strictly restricted to users in the **Owner department** (`HTTP 403 Forbidden` / disabled checkboxes) — a non-Owner creating or editing an employee never has an access level auto-ticked on their behalf (e.g. picking "Dev Member" as the department no longer silently adds "dev"), so the 403 this used to trigger doesn't happen.

---

## 6. Database & Persistence Mechanics

- **Environment Switching**: `DATABASE_URL` specifies the database. Unset → SQLite (`orbit.db`). Set → PostgreSQL (Neon).
- **No Trailing Slashes on API Routes**: FastAPI routes must be registered without trailing slashes (e.g. `/api/audit`, `/api/projects`). Trailing slashes trigger HTTP 307 redirects across CORS boundaries which strip the `Authorization` header.
- **Schema & Pydantic Schema Alignment**:
  - `AuditLogResponse.actor_id` is `Optional[str] = None` to support legacy or system-level audit records where `actor_id` is null.
  - Legacy NOT NULL constraints on live Postgres columns (`audit_logs.actor`, `project_comments.author`, `projects.team`) have been dropped (`DROP NOT NULL`) in favor of their FK counterparts (`actor_id`, `author_id`, `team_ids`).
  - `Project.completed_at` (nullable timestamp) is set when a project's status transitions to "Completed" and cleared if it's reopened — drives the "Completed projects fall off the Kanban board 20 days after completion" rule (see `frontend-next/CLAUDE.md`).
- **Account Hard Deletion Cascade**:
  - `EmployeeRepository.hard_delete_with_related_data()` safely handles permanent account deletion by:
    1. Setting nullable FK references to `NULL` (`Task.assignee_id`, `Task.created_by_id`, `Project.created_by_id`, `Customer.created_by_id`, `LeaveRequest.approved_by_id`).
    2. Deleting related records in `AttendanceRecord`, `WfhRequest`, `AuditLog`, `ProjectComment`, `LeaveRequest`, `SalarySlip`, `Expense`, and `Notification`.
    3. Deleting the `Employee` row cleanly without foreign key constraint errors.
- **Invoice PDF generation is pure Python** (`app/services/invoice_pdf_service.py`, reportlab) — no Word, no LibreOffice, no external binary. It used to fill a Word template (`app/templates/invoice_template.docx`) and convert it via `docx2pdf` (Windows/MS-Word COM automation only), which crashed on Render's Linux servers; that whole approach is gone.

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
