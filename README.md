# ORBIT — Operational Revenue & Business Intelligence Tool

**ORBIT** is the internal ERP / Professional Services Operating System built for **Upmotion Tech**. It replaces the spreadsheets-and-Slack-threads way of running the company with one system of record for sales pipeline, project delivery, HR, and finance — with a single login, real permissions, and one shared source of truth for numbers that used to live in five different places.

This README describes what's actually built and running today, not an aspirational roadmap. For a detailed, dated history of every decision, bug fix, and open item, see [`CLAUDE.md`](./CLAUDE.md) in this same directory — it's the authoritative build log for this project and is updated after every round of work.

---

## What ORBIT does

| Module | What it covers |
|---|---|
| **CRM** | Sales leads, pipeline stages (New → Contacted → Proposal → Negotiation → Won/Lost), scope documents & signed contracts, duplicate detection, activity log & comments |
| **Software Dev** | Projects (auto-created when a lead is Won) and Tasks/Subtasks, Kanban & list views, team assignment, time logging, attachments, threaded comments |
| **Finance** | Invoices (with a real Word-template-driven PDF generator), Expenses (with category & department budget tracking), Payroll / salary slips, Payment milestones |
| **HR** | Employee records, leave requests & balances, hiring pipeline (job openings + candidates), holidays & leave policy |
| **Dashboard & Reports** | Company-wide revenue/cash-position overview, delayed-project tracking, project profitability, resource utilization, expense-category budgets, exportable to Excel/PDF |
| **Setup** | Currency exchange rate, pipeline stages & lead sources, leave policy, audit trail, employee account activation/deactivation |
| **Auth & Permissions** | Real JWT login, bcrypt-hashed passwords, per-employee multi-select access levels (Owner/Dashboard/CRM/Dev/Finance/HR/Permissions/Employee), mandatory password change on first login or after an admin reset, instant account deactivation |
| **Notifications & Audit** | Real-time notification tray scoped to what each employee is actually meant to see (their own leave decisions, comments/assignments on things they're on) — never a company-wide broadcast unless you're the Owner. Every sensitive action is written to a real audit log. |

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend framework | FastAPI (async) |
| ORM | SQLAlchemy 2.x (async) |
| Validation | Pydantic v2 |
| Database (production) | PostgreSQL, hosted on **Neon** |
| Database (development) | SQLite (zero config — just run it) |
| Auth | JWT (`python-jose`) + `bcrypt` password hashing |
| PDF/Excel export | ReportLab, `python-docx` (Word-template fill for invoices), `openpyxl` |
| Backend hosting | **Render** |
| Frontend hosting | **Vercel** (static bundle, proxies `/api/*` to Render) |
| Frontend | A single self-contained HTML bundle (`ORBIT.html`) — see below |

The database is chosen automatically from `DATABASE_URL`: unset → SQLite (development), set → PostgreSQL via `asyncpg` (production). No code ever needs to change between environments.

---

## Architecture

The backend follows a straightforward clean-architecture layering, enforced by convention (not a framework):

```
backend/app/
├── core/          # config, DB engine/session, JWT + password hashing, PKT time helpers, dependencies
├── models/        # SQLAlchemy ORM models — one file per table
├── schemas/       # Pydantic request/response models — never leak ORM objects to the wire
├── repositories/  # All raw DB queries live here — routers and services never touch SQLAlchemy directly
├── services/      # Business logic, permission checks, validation, audit logging
├── routers/       # FastAPI endpoints — thin, just wire a service call to an HTTP verb
└── dependencies/  # (folded into core/dependencies.py) auth/role-gating dependencies
```

**Rule of thumb:** routers stay thin (no business logic), services own the rules, repositories own the SQL. Every router constructs its service via a small `get_*_service()` factory function that wires up the repositories it needs.

There are **no Alembic migrations** in active use — every table is created via `Base.metadata.create_all` on backend startup (see `main.py`'s `lifespan`). Schema *changes* to an already-existing table (a new column on a live table) are applied by hand with a one-off script against both the local SQLite file and the live Neon database — `CLAUDE.md` documents every one of these with the exact command used.

---

## Authentication & permissions

- Login is real: `POST /api/auth/login` checks a bcrypt hash and issues a JWT carrying the employee's id, name, and their full list of access levels.
- **Access levels are multi-select**, not a single role. An employee can hold any combination of `owner`, `dashboard`, `crm`, `dev`, `finance`, `hr`, `permissions`, `employee` — the sidebar and every screen-level gate is the union of whatever levels they hold. `owner` implies everything.
- **Temporary passwords**: when HR/Owner creates an employee or resets an existing one's password, that account is flagged `must_change_password`. The very next successful login is redirected straight to a mandatory Change Password screen (old password → new password → confirm) before anything else in the app is reachable. Changing your *own* password from your own profile does **not** re-trigger this (only an admin-initiated reset does).
- **Account deactivation**: an Owner can deactivate any other employee's account from Setup → Employees. A deactivated account is rejected at login with a clear message, and — critically — an already-logged-in session for that account is invalidated on its *very next* authenticated request (checked fresh against the database on every call, not just at token-issue time), not just at its next login.
- Role-gating dependencies live in `app/core/dependencies.py`: `get_owner_user`, `get_hr_user`, `get_finance_user`, `get_persona_roles` (the real multi-value list), and `get_persona_role` (a single derived "primary" role, kept only for the Projects/Tasks routers, which still predate the multi-access-level system).

---

## Time handling

ORBIT standardizes on **Pakistan Standard Time (Asia/Karachi, fixed UTC+05:00, no DST)** everywhere a date or time is shown — never the visitor's own machine timezone.

- Backend: `app/core/time.py` provides `now_pkt()` (use instead of `datetime.now()`/`utcnow()`) and `to_pkt()` (normalizes any datetime before it's serialized). Every response schema with a datetime field validates it through `to_pkt()`, so timestamps always serialize with a `+05:00` offset.
- Frontend: all date/time formatting explicitly passes `timeZone: 'Asia/Karachi'`, and "today" for filters/overdue checks is always the PKT calendar date, never the browser's local date.

---

## The frontend: `ORBIT.html`

The frontend is **not** a plain HTML/JS file you can edit with a text editor — it's a single, self-contained compiled bundle produced by a template-component runtime (the same one used by Claude's own Artifacts). Concretely:

- Near the end of the file, a `<script type="__bundler/manifest">` block holds compiled JS/font assets (gzip+base64), and a `<script type="__bundler/template">` block holds the entire page's HTML template as one big JSON string, using custom directives (`<sc-if>`, `<sc-for>`) and `{{ expr }}` interpolation.
- Inside that template, a `<script type="text/x-dc" data-dc-script">` tag holds the actual app logic — a single `Component extends DCLogic` class with `state`, methods, and a `renderVals()` method whose returned object is exactly the set of names usable in `{{ }}` bindings in the template. It behaves like a normal React class component; it's just authored against this template compiler instead of JSX.

**Three identical copies of this bundle must always stay in sync**: `ORBIT.html` (repo root), `backend/static/index.html` (served by FastAPI at `/`), and `frontend/index.html` (deployed to Vercel).

To edit it: extract the template HTML and the embedded script into separate plain files, edit those normally, then re-serialize the template string back into the bundle — verifying tag balance (`sc-if`/`sc-for` open vs. close counts, `{{ }}` count) and that every `{{ identifier }}` used in the template actually exists as a key in `renderVals()`'s returned object before repackaging. `CLAUDE.md` documents the exact tooling and has caught several real bugs this way (a key returned under the wrong name, a missing `!` negation, etc.).

---

## Running it locally

```bash
cd backend
pip install -r requirements.txt

# Development — SQLite, zero config
uvicorn app.main:app --reload
```

Must be run from inside `backend/` — the app's imports are absolute (`app.core...`) and only resolve when `backend/` is the working directory. Open **http://localhost:8000** for the app itself, **http://localhost:8000/docs** for the interactive API docs.

On first startup the backend seeds realistic sample data (`backend/scripts/seed_hr.py`, `seed_finance.py`) if the database is empty — including one HR admin login (`hamzashafiq@theupmotion.online` / `1234`) for getting into the app immediately.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | No | SQLite file | PostgreSQL connection string for production (Neon) |
| `SECRET_KEY` | No (but should be set in production) | dev key | JWT signing key |
| `UPLOAD_DIR` | No | `app/storage` | Local file-upload directory |
| `DEBUG` | No | `true` | SQLAlchemy query echo |

---

## Deployment topology

```
 Vercel (frontend/index.html)  ──►  Render (FastAPI backend)  ──►  Neon (PostgreSQL)
        static bundle                  ORBIT.html served                production DB
                                        from backend/static/
                                        at "/" too
```

- **Backend → Render**, with `DATABASE_URL` pointing at Neon.
- **Database → Neon PostgreSQL**. Every schema change (new table, new column) that's been verified locally is also applied by hand directly against the live Neon database as part of the same work session — see `CLAUDE.md` for the exact migration commands run and when.
- **Frontend → Vercel**, `frontend/vercel.json` rewrites `/api/:path*` to the Render backend. (Routers must register their collection endpoints without a trailing slash — a trailing-slash redirect crossing the Vercel→Render origin boundary causes browsers to silently strip the `Authorization` header, which caused a real production outage once; see `CLAUDE.md`.)

Nothing gets pushed or deployed without explicit request — even when a fix has been fully verified locally, committing and deploying is treated as a separate, deliberate step.

---

## Project structure

```
Orbit/
├── ORBIT.html              # the compiled frontend bundle (see "The frontend" above)
├── CLAUDE.md                # authoritative, continuously-updated build log — read this first
├── README.md                 # this file
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, router registration, startup seeding
│   │   ├── core/              # config, DB session, JWT/password hashing, PKT time, permission dependencies
│   │   ├── models/            # ~24 SQLAlchemy models (Lead, Project, Task, Employee, Invoice, Expense, ...)
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── repositories/      # DB query layer
│   │   ├── services/          # business logic + permission checks
│   │   ├── routers/           # ~22 route modules, one per resource
│   │   ├── templates/          # invoice_template.docx (filled to generate invoice PDFs)
│   │   └── storage/            # uploaded files (local dev)
│   ├── static/index.html      # bundle copy served by FastAPI at "/"
│   ├── scripts/                 # seed_hr.py, seed_finance.py, wipe_hr.py, etc.
│   └── requirements.txt
└── frontend/
    ├── index.html              # bundle copy deployed to Vercel
    └── vercel.json             # /api/* rewrite to the Render backend
```

---

## Known gaps / open roadmap

This is an actively evolving internal tool. As of the most recent work session, the largest still-open items (see `CLAUDE.md` for full detail) are:

- **Alembic migrations** aren't wired in yet — every schema change so far has been a hand-run one-off script. This is explicitly planned before the module surface grows much further.
- **Persona-system cleanup**: the Software Dev (Projects/Tasks) routers still run on an older single-role permission model that predates the current multi-access-level system, kept deliberately unchanged to avoid destabilizing a working feature — a full migration to the real per-employee permission model is still pending.
- **Technical-debt sweep**: removing dead mock-data code paths, consolidating duplicate API-call patterns, and a final audit that no prototype-only logic remains in any "completed" module.
- The invoice PDF generator currently relies on Microsoft Word via COM automation (Windows-only) for the docx→PDF conversion step — this will need swapping for a Linux-compatible converter before it can run on the Render production server.

## Contributing / working on this repo

If you're an AI agent (or a human) picking this project back up, **read `CLAUDE.md` before making assumptions about what is or isn't implemented** — it is kept meticulously up to date, records the reasoning behind non-obvious decisions, and documents several real bugs (and their root causes) that are easy to reintroduce by accident if you don't know the history.
