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
│   │   ├── assets/                 # Static brand assets baked into generated PDFs (logo, approval stamp, salary-slip signature/watermark/footer icons)
│   │   ├── storage/                # Physical storage directory — legacy; see §6, uploads no longer go here
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
- Deep-linking: every lead/project/task/customer/employee card or "View" link is a real `<a href="#/type/id">` (see `deepLinkHref`/`parseDeepLinkHash`/`clearDeepLinkHash` in `orbit-client.js`) — this is what makes right-click/ctrl-click/middle-click "open in new tab" work, and it's also how the topbar Universal Search opens a result: navigate to the owning page with that hash, and a mount effect on that page reads the hash and opens the right drawer. The same `#/type/id` hash also now supports `leave` and `wfh` types (not just `lead`/`project`/`task`/`employee`/`customer`).
- **Access guard**: `Shell.tsx` redirects any user away from a screen their `access_levels` don't actually cover (`isScreenAllowed` + a `useEffect` calling `router.replace` to `deriveLandingFromAccess`'s result) — this was a real gap, not just cosmetic: the sidebar link being hidden was previously the *only* thing stopping a user from landing on/navigating to a screen (e.g. Dashboard) they had no business seeing, whether by bookmark, direct URL, or simply logging in at the bare root URL. Don't remove this guard without replacing it with something equivalent.
- **Notifications** carry `related_type`/`related_id` (`task`, `project`, `lead`, `leave`, `wfh`) set server-side wherever they're created, so the frontend's `notificationHref` (`Shell.tsx`) can deep-link a click straight to the actual record instead of doing nothing. An hourly scheduled job (`_run_notification_cleanup` in `app/main.py`) deletes any notification older than 24h, read or not — notifications are a short-lived "what just happened" feed, not a permanent log (that's what the Audit Trail is for).
- **Mark Attendance** is also a topbar quick action (`Shell.tsx`), not only a button on the My Attendance page — both call the same idempotent `POST /api/attendance/mark`.
- **Responsive layout**: a first pass exists (sidebar auto-collapses/becomes an overlay on phone-sized viewports, topbar reflows) — this app was fixed-width/desktop-only before. Individual pages' own content (tables, Kanban boards, side-by-side cards) still isn't redesigned for mobile; it scrolls horizontally within its own section rather than reflowing.
- **New-employee welcome email is currently disabled** (commented out, not deleted, in `employee_service.py`'s `create_employee`) per an explicit request — the temp password is still generated and returned in the response, it's just not emailed out right now. Uncomment the `email_service.send_welcome_email(...)` calls to resume sending it.

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

## 6. Company Policies & AI Assistant

- **Model**: `Policy` (`app/models/policy.py`) — a policy is either typed `content` (text) or an uploaded PDF (`file_data`/`file_name`, stored as bytes — see §8's file-storage standard), never both required. `extracted_text` caches the PDF's text (via `pypdf`) at upload time so the assistant never has to re-parse the binary on every question.
- **Access**: any authenticated employee can read policies and ask the assistant. Creating/editing/deleting a policy (or its file) is gated on **Owner department** specifically (`get_owner_department_user` in `app/core/dependencies.py`, checking `department == "Owner"`) — the same convention used elsewhere for HR/CRM/Dev/Setup Owner-only actions, not the `"owner"` access-level token.
- **RAG assistant** (`POST /api/policies/ask`, `app/services/groq_service.py` + `policy_service.py`): deliberately **not** a vector-embedding pipeline — every question re-reads all current policies fresh from the DB and stuffs their content into the prompt, so anything an Owner just published or edited is immediately answerable with zero re-indexing step. Backed by Groq's OpenAI-compatible chat completions API (`GROQ_API` env var, model configurable via `GROQ_MODEL`, defaults to `llama-3.3-70b-versatile`). If `GROQ_API` is unset, the endpoint returns a clean "not configured" message rather than erroring.
- **Frontend** (`frontend-next/src/app/me-policies/page.tsx`): Owner-only "Add Policy" (text or PDF), a table of published policies any employee can open, and a chat-style assistant box rendering the model's markdown response properly (`react-markdown` + `remark-gfm` — the raw response is real markdown, not plain text).

---

## 7. Payroll: Tax Slabs & Year-End Tax Certificates

- **Pakistan's fiscal year (FY) runs July 1 → June 30**, named after the calendar year it *ends* in per FBR convention ("Tax Year 2026" = Jul 1, 2025 – Jun 30, 2026). The frontend/user-facing label format is the two-year form instead (`"2025-2026"`) — both appear together on generated certificates.
- **Tax slabs can be edited at any time** (Setup → Tax Slabs, Owner department only for writes via `get_owner_department_user`) and this must never retroactively change a month that's already passed — see `SalarySlipService.get_or_create_slip`'s `is_current_or_future` scoping (§5-adjacent payroll logic). Only a slip for the current or a future month resyncs against the live slab table; past months stay frozen at whatever was actually calculated/paid at the time. **Slabs never expire or auto-reset** — the `TaxSlab` model has no fiscal-year binding or date range, just `active`/`inactive`, and no scheduled job anywhere touches the table (checked every cron-like job registered in `main.py`); a slab entered today stays exactly as entered indefinitely, a year or ten years from now, until an Owner manually edits or deletes it. Adjacent brackets must use `previous_max + 1` as the next bracket's `min_salary` (matching the official "exceeds Rs. X" wording literally) — using the exact same boundary value on both sides trips `_validate_no_overlap`'s inclusive-inclusive overlap check (a real, currently-unfixed bug: two ranges sharing one exact endpoint are flagged as overlapping and rejected with a 422).
- **No separate "tax certificate" table exists anywhere.** Every certificate/statement below is computed fresh, on demand, straight from existing `SalarySlip` rows (`app/services/tax_certificate_service.py`) — the same "always re-read live data, never a stale precomputed index" philosophy §6's Policy RAG assistant already uses. This was a deliberate choice so the feature needed **zero schema changes** and is safe to ship without any production migration.
- **Fiscal-year gating**: a FY is only offered as a certificate option once it has actually closed — i.e. starting the day after its June 30 end date (`TaxCertificateService._latest_completed_fy_end_year`, pure date math off `now_pkt()`). Asking for a certificate for the still-open current FY 400s with an explicit "hasn't ended yet" message. An employee's own list of available years is further bounded by their `start_date` — someone hired mid-FY only ever sees years starting from the FY they actually joined in, and if hired during the still-open FY, sees none yet.
- **Mid-year joiners get a partial-year certificate, not a full one**: the employee endpoint pulls whatever `SalarySlip` rows actually exist between the FY's start/end months (string comparison on `"YYYY-MM"`) — if someone joined in October, their July–September rows simply don't exist and are never fabricated; the certificate PDF notes when it covers fewer than 12 months.
- **Three surfaces**:
  - **Setup → Tax Slabs → Monthly Tax Deduction Summary**: a running month-by-month rollup (employees paid, total gross, total tax withheld) for a selected FY — including the **current, still-open** FY (unlike the certificates below, this view has no completion gate, since its whole point is watching the year build up before it closes). `GET /api/finance/tax-certificates/monthly-summary` (Finance/Owner), `GET .../summary-years` for the picker.
  - **My Record → Tax Certificate**: any employee downloads their own "Certificate of Deduction of Income Tax" (Section 149 format) for a completed FY they were actually employed during. `GET /api/finance/tax-certificates/years/me` + `GET .../me/pdf?fiscal_year=...` (self-scoped via `get_current_user`, no separate admin override endpoint exists to pull another employee's certificate — out of scope until asked).
  - **Setup → Tax Slabs → Company Tax Certificate**: Owner-department-only "Annual Statement of Tax Deducted from Salaries" (a Section 165 withholding-statement equivalent) listing every employee's total gross/tax for a completed FY plus a grand total. `GET /api/finance/tax-certificates/years/company` + `GET .../company/pdf?fiscal_year=...`, both gated by `get_owner_department_user`.
- **PDF generation**: `app/services/tax_certificate_pdf_service.py`, reportlab, in-memory bytes — mirrors the invoice/salary-slip PDF services' letterhead constants (`COMPANY_ADDRESS`, `APPROVER_NAME`, logo/stamp assets) exactly. `COMPANY_NTN` is currently a blank placeholder constant (line omitted from the letterhead while empty) — **the user has said they'll supply their own exact certificate template later**, so treat this layout as a placeholder to swap out, not a finalized design.
- **Local dev data**: `backend/scripts/seed_historical_payroll.py` backfills realistic multi-month/multi-FY `SalarySlip` history (one row per employee per month, from their own `start_date` through last month, `Paid`, computed via the live `TaxSlabService`) so the certificate feature has real data to generate against locally. Same local-sqlite-only guard as `seed_pakistan_demo.py`; idempotent (skips any employee/month that already has a slip, including the current month, which stays exclusively Payroll's own live territory) — safe to re-run.

---

## 8. Database & Persistence Mechanics

- **File uploads are stored as bytes in Postgres, never on local disk.** Render's filesystem is ephemeral — it's wiped on every redeploy, which silently 404'd every previously-uploaded file the first time the backend redeployed after upload. Every upload feature (Policy PDFs, Lead scope documents/signed contracts, Project attachments, Employee contracts) stores the raw bytes directly in a `..._data` `LargeBinary`/`BYTEA` column (plus a `..._name` column for the original filename) instead of a disk path, and is served back through a dedicated **authenticated** `GET` endpoint (e.g. `GET /api/policies/{id}/file`, `GET /api/leads/{id}/scope-document`, `GET /api/projects/{id}/attachments/{filename}/file`, `GET /api/employees/{id}/contract`) rather than a public static-file URL. Response schemas expose a computed `..._url` field (e.g. `resp.file_url = f"/api/policies/{id}/file" if policy.file_data else None`) built fresh on every response, not stored.
  - **Frontend consequence**: because these are now authenticated endpoints, a plain `<a href={url} target="_blank">` doesn't work (the browser sends no `Authorization` header on a bare anchor navigation — it would just 401). Every "open/view file" link in the frontend instead does `fetch(url, { headers: { Authorization: 'Bearer ' + token } })`, converts the response to a Blob, and opens that via `URL.createObjectURL` + `window.open(...)`. See any of `me-policies`, `crm`, `dev`, `hr`, or `me-record`'s page.tsx for the exact pattern.
  - The old `backend/app/storage/` directory and `storage_service.py` still exist and are still used for `ALLOWED_EXTENSIONS`/size-limit validation helpers, but no feature writes a new file there anymore — don't reintroduce disk-based storage for anything new.
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
- **Invoice PDF generation is pure Python** (`app/services/invoice_pdf_service.py`, reportlab) — no Word, no LibreOffice, no external binary. It used to fill a Word template (`app/templates/invoice_template.docx`) and convert it via `docx2pdf` (Windows/MS-Word COM automation only), which crashed on Render's Linux servers; that whole approach is gone. The generated letterhead (logo, company address, "Approved by" signature + partner stamp) is extracted directly from the original `Invoice Template.docx` and its embedded images (`app/assets/upmotion_logo.png`, `app/assets/upmotion_stamp.png`) — an earlier rewrite had drifted from that template (wrong logo asset, and had used ORBIT's own internal-tool tagline as if it were company letterhead text). `Invoice.registration_number`/`Invoice.ntn` are set per-invoice at creation time (Finance's invoice form), not fixed constants, and appear on the letterhead only when provided.
- **Salary Slip PDF now matches a real company template** (`app/services/salary_slip_pdf_service.py`) — laid out to match `Salary Slip General template.docx` (supplied by the user) field-for-field, its exact positions/fonts/images extracted directly from that file's own XML and embedded images, not guessed. Unlike every other PDF service here (which build a top-down Platypus flowable "story"), this one draws directly onto a raw reportlab `Canvas` at absolute coordinates on a real **A4** page (not the US Letter the others use) — the source template genuinely relies on overlapping/absolute-positioned elements (a full-page background watermark, two floating text blocks side-by-side at the same height, a signature+stamp cluster) that don't fit a flowing document model. New assets specific to this template live at `app/assets/salary_slip_*.png` (signature, watermark, footer icon cluster); the logo/stamp are the same artwork already at `upmotion_logo.png`/`upmotion_stamp.png`, reused as-is. **Field mapping** (the template's 4 earnings rows vs. `SalarySlip`'s 3 numeric fields, confirmed with the user rather than guessed): Basic Pay = `gross_salary`, Incentive Pay = `bonus`, House Rent Allowance = `allowances`, Meal Allowance = always 0 (nothing in ORBIT tracks it separately). The template's blank Deductions column got explicit `Income Tax`/`Other Deductions`/`Total Deductions` labels and a `Net Pay` row added on top of what the blank template actually printed — those specific labels are an interpretive completion, not something the source file spelled out, so worth a second look if the real template intended something else there.

---

## 9. Operational Checklist & Commands

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
