# Project

ORBIT — Operational Revenue & Business Intelligence Tool

Internal ERP/Professional Services Operating System for Upmotion Tech.

---

# Objective

Build a production-ready backend that powers an existing frontend prototype.

The frontend currently contains only dummy data.

Backend replaces every mock operation with real persistent data.

---

# Stack

Backend
- FastAPI
- SQLAlchemy 2.x
- Alembic
- PostgreSQL (Production)
- SQLite (Development)
- Pydantic v2

Deployment
- Backend → Render
- Database → Neon PostgreSQL
- Frontend → Vercel

---

# Architecture

Use clean architecture.

app/
    core/
    models/
    schemas/
    repositories/
    services/
    routers/
    dependencies/

Business logic belongs in services.

Routers stay thin.

Repositories contain database operations.

---

# Database

Production
- PostgreSQL

Development
- SQLite

Automatically choose using DATABASE_URL.

Never require code changes between environments.

---

# Time

ORBIT standardizes on Pakistan Standard Time (Asia/Karachi, fixed UTC+05:00, no DST) — not the visitor's browser-local timezone.

Backend: `app/core/time.py` provides `now_pkt()` (use in place of `datetime.now(timezone.utc)`) and `to_pkt()` (normalizes any datetime — naive or otherwise — before it's serialized). Every response schema with a datetime field validates it through `to_pkt()` via a `field_validator`, so timestamps always serialize with a `+05:00` offset.

Frontend: date/time formatting always passes `timeZone: 'Asia/Karachi'` explicitly to `toLocaleDateString`/`toLocaleTimeString` (see `PKT_TZ` in script.js), and "today" for filters/overdue checks is computed as the PKT calendar date (`todayISO()`), not the browser's local date.

Never produce or display a UTC/"Z" timestamp anywhere in the app — every user should see the same PKT time regardless of their own machine's timezone.

---

# Principles

- Follow the PRD.
- No shortcuts.
- No unnecessary abstractions.
- No business logic inside routers.
- Production-quality code.
- Modular.
- Extensible.
- Strong validation.
- Good API design.

---

# Frontend

Current frontend:

ORBIT.html

Single bundled SPA.

No React source available.

Do not modify until backend is ready.

Frontend integration happens later.

## ORBIT.html internal format (read before editing)

ORBIT.html is NOT plain HTML/JS you can edit directly with a text editor. It's a
compiled bundle produced by the `dc-runtime` template system (the same
template-component runtime used by this tool's own Artifacts):

- Near the end of the file there are `<script type="__bundler/manifest">` and
  `<script type="__bundler/template">` blocks.
- The manifest is a JSON object mapping UUIDs to assets (JS/fonts), some
  gzip+base64 compressed (`"compressed": true`).
- The template block is a single big JSON string containing the full page
  HTML, using custom directives (`<sc-if value="{{ expr }}">`, `<sc-for
  list="{{ arr }}" as="item">`) and `{{ expr }}` interpolation. The `{{ }}`
  expression language is intentionally limited — only literals, dotted/bracket
  property paths, `!`, and `===`/`!==`/`==`/`!=`. No `&&`/`||`/ternaries/method
  calls, so any real logic must be precomputed in JS and exposed as flat
  booleans/strings.
- Inside that template, a `<script type="text/x-dc" data-dc-script>` tag holds
  the actual app logic: `class Component extends DCLogic { state = {...};
  ...methods...; renderVals() { ...; return {...}; } }`. `renderVals()`'s
  return object is exactly the set of names usable in `{{ }}` in the template.
  This behaves like a normal React class component (`this.setState` triggers
  a real re-render), just authored against a template compiler instead of JSX.

**To edit it:** extract the template string and the `data-dc-script` JS into
separate `.html`/`.js` files (decode the JSON string on that line), edit those
as normal files, then re-serialize the template string back into that one
line of ORBIT.html. Don't hand-edit the raw JSON-escaped line directly. A
`node --check` on the extracted script and a brace/tag-balance check on the
template (`{{`/`}}`, `sc-if`/`sc-for` open vs close counts) are cheap ways to
catch mistakes before writing back.

---

# Current Phase

Backend development.

Frontend integration later.

---

# Modules

1. Authentication
2. CRM
3. HR
4. Finance
5. Software Development
6. Dashboard
7. Reports
8. Permissions
9. Notifications
10. Audit

Implement one module at a time.

---

# Source of Truth

The PRD is the authoritative specification.

If implementation conflicts with assumptions, follow the PRD.

---

# Implementation Status (as of 2026-07-16)

This section is a snapshot for picking the project back up in a fresh session.
It reflects what's actually built, not the aspirational plan above — check
here first before assuming a module is (or isn't) real.

## What's real (backend-backed) vs still mock

| Module | Status |
|---|---|
| **CRM → Leads** | Fully real. Backend CRUD + file uploads + activity log + comments, all wired end-to-end in the frontend. |
| **Currency Settings** (Setup → Currency) | Fully real. System-wide USD→PKR rate, Owner-only edit, backed by DB. |
| **Currency Preferences** (Dashboard/Reports currency toggle) | Fully real. Per-persona, per-module, backed by DB. |
| **Dashboard, Reports, Software Dev (Projects/Tasks), Finance, HR, Me, Setup (other tabs), Permissions, Audit** | Still frontend mock data (`window.ORBIT_APP_DATA`) — no backend tables/endpoints exist yet. The Software Dev Projects list and its date-range filter operate on this mock data client-side. |

There is no real authentication. `get_current_user` always resolves to
`{"sub": "anonymous", "role": "owner"}` unless a bearer token is sent (JWT
plumbing exists in `core/security.py` but nothing issues tokens yet). The
frontend's persona switcher (Owner / Finance Head / Dev Team Member / Any
Employee) is a UI-only simulation of "different users" — where a backend
feature needs a "user id" (e.g. currency preferences), the frontend sends the
**persona id** as that identifier, since it's the only real "who is this"
concept that exists today.

## Backend — what's implemented

`backend/app/`:
- `models/`: `Lead`, `LeadActivity`, `CurrencySettings` (singleton row id=1),
  `CurrencyPreference` (unique per `user_id`+`module`).
- `schemas/`: `lead.py`, `lead_activity.py`, `settings.py`
  (`CurrencySettingsResponse`/`Update`), `currency_preference.py`, `common.py`.
- `repositories/`: `lead_repository.py`, `activity_repository.py`,
  `settings_repository.py`, `currency_preference_repository.py`.
- `services/`: `lead_service.py`, `settings_service.py`,
  `currency_preference_service.py`, `storage_service.py` (local filesystem,
  `UPLOAD_DIR`, served at `/api/storage/<filename>`).
- `routers/`: `leads.py`, `settings.py` (`/api/settings/currency`),
  `preferences.py` (`/api/preferences/currency/{user_id}`).
- `core/time.py`: PKT time helper — see Time section above.
- `core/dependencies.py`: `get_current_user` (anonymous/owner default),
  `get_owner_user` (raises 403 if `role != "owner"` — used to gate the
  currency-rate PUT endpoint).

### Leads API (`/api/leads`) — all of the README's 11 endpoints are implemented and live:
`GET /`, `GET /search`, `GET /{id}`, `POST /`, `PUT /{id}`,
`PATCH /{id}/stage`, `DELETE /{id}` (soft delete via `deleted_at`),
`POST /{id}/scope-document`, `POST /{id}/signed-contract`,
`DELETE /{id}/scope-document`, `DELETE /{id}/signed-contract` (clears the DB
field, deletes the physical file, resets `is_locked_revenue`, logs an
activity — added after upload-only was the initial cut),
`GET /{id}/activities`, `POST /{id}/activities` (also used for comments, via
`type: "comment"`).

Backend enforces the same stage-workflow rules as the frontend
(`STAGE_WORKFLOW` in `lead_service.py`) — owners can override, everyone else
must move sequentially and can't jump straight to Won/Lost except from
Negotiation. Duplicate-lead detection (`lead_repository.find_duplicates`) had
a real bug fixed on 2026-07-16: the deleted-row filter was accidentally
OR'd into the match conditions instead of AND'd, so it matched almost every
lead regardless of name — worth remembering as the shape of bug to watch for
if duplicate/false-positive filtering issues resurface elsewhere.

### Currency Settings (`/api/settings/currency`)
Singleton row, default `276.52` PKR per USD. `GET` open to anyone, `PUT`
Owner-only (403 otherwise), validates `rate > 0`.

### Currency Preferences (`/api/preferences/currency/{user_id}`)
`GET` returns `{module: currency}` dict for that user id (persona); `PUT`
upserts one module's currency. Frontend currently uses modules `"dashboard"`
and `"reports"` (Finance was deliberately left out — it shows each
invoice/expense in its own native currency already, with no single
reporting-currency toggle to split, so there's nothing to key by module
there yet).

## Frontend — what's implemented (all inside ORBIT.html's embedded script/template)

The CRM Leads page (`screenIsCrm` in the template, `Component` class in
script.js) was rebuilt from a static-mock prototype into a fully live,
production-feeling page:

- **Data**: loads from `GET /api/leads` on mount (`loadLeads`), refetches
  after every mutation. `apiLeadToDisplay()` / `LEAD_FIELD_TO_API` /
  `buildApiFieldPatch()` are the two-way field-name mapping layer (frontend
  `name`/`poc`/`received`/... ↔ backend `company_name`/`client_contact_name`/
  `date_received`/...). `leadsApi` object wraps every endpoint call.
- **Search**: real-time, debounced, multi-field, word-based, case-insensitive,
  with match highlighting (`highlightSegments`, `matchesSearch`,
  `leadSearchHaystack`). Also wired into the *global* top-bar search (it used
  to only search stale mock leads — fixed).
- **Filters**: source/stage/rep, all combine with search; a reusable
  date-range filter (`DATE_RANGE_OPTIONS`, `resolveDateRangePreset`,
  `inDateRange` — Today/Yesterday/Last 7/30 Days/This Month/Last Month/This
  Year/Custom) applied to Leads (on `received`) and to Software Dev Projects
  (on `deadline`, client-side since Projects has no backend yet). Date math
  is done in PKT, not the browser's local date.
- **Sort**: `CRM_SORT_OPTIONS`/`sortLeads` — newest/oldest/value/name/recently
  updated, applied after filtering.
- **Create/Edit**: validated client-side, then real `POST`/`PUT`. Edit Lead
  has **no Save/Done button** — every field auto-saves (debounced ~500ms per
  field via `setLeadField`), with a "Saving…"/"Changes save automatically"
  affordance and a toast on completion. Duplicate-name warning is a live
  client-side check against loaded leads, backed by the server's own
  duplicate warning on create.
- **Stage changes**: client-side pre-check (fast feedback) then
  `PATCH /stage`; drag-and-drop between Kanban columns calls the same path.
  Won requires both attachments (checked before allowing the move).
- **Delete**: confirm dialog → real `DELETE` (soft delete).
- **Attachments**: upload/replace/remove all hit real endpoints; "Attached:
  filename" is a real link to `/api/storage/...` (opens/downloads the file).
- **Activity log & comments**: fetched from `GET /activities` when a lead
  opens; comments post via the same endpoint with `type: "comment"`.
- **Follow-up badges**: red "overdue" (past due) and amber "due
  today/tomorrow" (`followUpDueSoon`), both computed against PKT "today".
- **Kanban card**: shows the lead's real DB creation date ("Started: ..."),
  drag-and-drop with lift/hover animation (`.crm-card`, `style-hover`).
- **Toasts**: a real queued/tone-based system (`pushCrmToast(text, tone)`,
  `TOAST_TONE_META` — success/error/warning, icon + accent color), rendered
  in a container moved to the top level of the template (not
  screen-gated) so any screen (e.g. Setup → Currency Settings) can use it.
- **Animations**: `.crm-overlay-fade` / `.crm-panel-slide` / `.crm-pop` /
  `.crm-toast` keyframes defined in a `<style>` block added near the
  template's other helmet styles; used on modals, drawers, and toasts.
- **Assigned Rep dropdown**: lists every employee across all departments
  (was accidentally Sales-only).
- **Navigation**: clicking the ORBIT logo goes to the current persona's home
  screen (`goHome`); the current screen persists across a page refresh via
  `localStorage` (`readStoredScreen`/`writeStoredScreen`) — previously every
  refresh bounced back to Dashboard.
- **Currency**: Dashboard and Reports each have their own USD/PKR toggle
  (`dashboardCurrency`/`reportsCurrency` state, `setDashboardCurrency`/
  `setReportsCurrency`), loaded from and saved to the preferences API,
  reloaded whenever the persona switches. `toUSD`/`inReporting`/`moneyRep`
  now take the live rate as a parameter instead of a hardcoded `278` constant
  — the rate itself comes from `GET /api/settings/currency` on mount.
  Setup → Currency tab (`setupTabIsCurrency`) shows/edits it.

## Known scope boundaries / things deliberately left alone

- **Settings tab → Stages & Sources rename/delete**: still writes to
  `leadOverrides` state, which is no longer merged into the displayed lead
  list (that merge step was removed when Leads went live-backend). These
  actions won't crash, but they no longer visibly affect anything — there's
  no backend for stage/source management. Flagged, not fixed, since it's a
  separate, unrelated feature.
- **Finance, HR, Software Dev, Reports KPIs, Dashboard KPIs**: still 100%
  mock data. A prior large ask to make the whole Dashboard "real BI" was
  intentionally scoped down (user chose "Currency Settings backend first")
  because it implicitly required building Finance/HR/Dev backends from
  scratch — that work has not been started.
- **Comments/rename-stage/etc. elsewhere in the app** (Dev, Finance, HR
  screens): untouched, still whatever the original prototype had.

## Workflow notes for future sessions

- **Editing ORBIT.html**: see the "ORBIT.html internal format" section above.
  Practical loop used throughout this work: extract `template.html` +
  `script.js` to the scratchpad, edit those as plain files, `node --check`
  the script and count `sc-if`/`sc-for`/`{{`/`}}` balance in the template,
  **then repackage once** (don't repackage after every small edit — it's
  wasted work; batch edits and do a single repackage pass when ready to
  test). Repackaging must re-escape `</script` inside the embedded JSON
  string as `<\/script` or the browser's HTML parser truncates the bundle
  (`json.dumps` does not escape `/` by default — this caused a real outage
  earlier in this project's history, worth remembering).
- **Two copies of the bundle**: `ORBIT.html` (repo root) and
  `backend/static/index.html` (served by the FastAPI backend at `/`) must be
  kept identical — repackage into both every time.
- **Running the backend**: `cd backend && uvicorn app.main:app --reload`
  (must run from inside `backend/`, since `app.core...` imports are absolute
  and only resolve when `backend/` is the working directory / on `PYTHONPATH`).
- **Verifying backend changes**: this project has no test suite; changes were
  validated ad hoc with FastAPI's `TestClient` against a throwaway SQLite DB
  (`DATABASE_URL=sqlite+aiosqlite:///./test_x.db`, deleted after). Prefer
  that over trusting code review alone for anything touching persistence.

---

## Phase 2 Implementation Details (as of 2026-07-16)

The second phase involved building out the **Software Development module** (Projects and Tasks) and connecting it to the database, implementing RBAC controls, threaded comments, multi-file attachments, view persistence, automatic CRM integration, notifications, and real-time frontend-backend synchronization.

### 1. Database and Models
Created and registered the following tables in the SQLite database (served by SQLAlchemy):
- **Projects (`projects`)**: Links to CRM Leads (`lead_id`), containing fields for name, client, status, deadline, budget, description, and team assignments (stored as a JSON string array).
- **Tasks (`tasks`)**: Subtasks belonging to a project. Contains title, status, description, deadline, and assignee.
- **ProjectComments (`project_comments`)**: Threaded comments belonging to projects or tasks, containing `parent_id` for recursive replies, author, and PKT timestamp.
- **ProjectAttachments (`project_attachments`)**: Storage references for files uploaded to projects, containing filename, URL, size in bytes, and creator name.
- **Notifications (`notifications`)**: Real database-backed notification tray containing `user_id` (e.g. `'devmember'`, `'owner'`), message, and read/unread status.
- **TimeEntries (`time_entries`)**: Work hours logged on projects and tasks.

### 2. Frontend-Backend Integrations
- **Live Sync**: Updated `setScreen` to fetch fresh records (Leads, Projects, Tasks, Notifications, Time Entries) from the FastAPI backend whenever you switch tabs.
- **Auto-save on Drawer Edits**: Removed all manual "Save/Done" buttons from the Project Details Drawer and Task Details Drawer. Editing any text fields or selects auto-saves immediately with a debounced delay (600ms) and toast confirmation.
- **Details Drawer Loaders**: Defined `loadProjectDetails` and `loadTaskDetails` which trigger upon drawer opening to fetch fresh lists of comments and attachments from the backend.
- **Case-Insensitive Uniqueness**: Configured project name validation to compare names case-insensitively using `func.lower`.
- **Duplicate Suffixing**: Leads marked `Won` automatically append a counter (e.g., `Hash — Project 2`) if a project of that name already exists.
- **New Task Assignee Constraint**: Added an Assignee dropdown selector to the New Task dialog, dynamically listing only the team members currently assigned to the selected project.
- **Staging / Compiling**: Packaged code into `ORBIT.html` and `backend/static/index.html` with correct `<\/` script tag escaping to prevent premature browser parsing truncation.
- **Delete Project**: Added a **Delete Project** footer button in the project details drawer (styled as `variant="danger"` via the Healer Design System) available only to Owners, Finance Heads, etc. (controlled via the `showProjectFinance` check).

### 3. File Map & Overview
Here is a guide to the key files for the next agent:

#### Database Models (`backend/app/models/`)
- [project.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/models/project.py): The `Project` model, referencing `lead_id` and storing the `team` member list as a JSON array.
- [task.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/models/task.py): The `Task` model, containing project relationships, status, deadline, and assignee.
- [project_comment.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/models/project_comment.py): The `ProjectComment` model, supporting threaded parent-child relations.
- [project_attachment.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/models/project_attachment.py): The `ProjectAttachment` model, storing file upload links.
- [notification.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/models/notification.py): The `Notification` model, powering the live notification bell.
- [time_entry.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/models/time_entry.py): The `TimeEntry` model, tracking project hours.

#### Repositories (`backend/app/repositories/`)
- [project_repository.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/repositories/project_repository.py): DB queries for projects, search matching, filtering, attachments, and comments. Includes case-insensitive name uniqueness checks.
- [task_repository.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/repositories/task_repository.py): DB queries for tasks.
- [notification_repository.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/repositories/notification_repository.py): DB queries to read/write/mark notifications read.
- [time_entry_repository.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/repositories/time_entry_repository.py): DB queries for logging time.

#### Services & Routers (`backend/app/services/` & `backend/app/routers/`)
- [project_service.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/services/project_service.py) & [projects.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/routers/projects.py): Manages projects lifecycle, deadline checks, team picker mapping, attachments and comment operations.
- [task_service.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/services/task_service.py) & [tasks.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/routers/tasks.py): Handles task assignments and updates.
- [notification_service.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/services/notification_service.py) & [notifications.py](file:///c:/Users/hashi/OneDrive/Desktop/Orbit/backend/app/routers/notifications.py): Handles notification updates and reading.

#### Repackaging Utilities
- [unpack.py](file:///C:/Users/hashi/.gemini/antigravity-ide/brain/68b521ad-7423-4ad3-a5d0-69f831c61449/scratch/unpack.py): Python tool to decode `ORBIT.html` bundle manifest and extract the template HTML (`unpacked/template.html`) for editing.
- [pack.py](file:///C:/Users/hashi/.gemini/antigravity-ide/brain/68b521ad-7423-4ad3-a5d0-69f831c61449/scratch/pack.py): Re-serializes the updated `template.html` back into `ORBIT.html` and copies it to `backend/static/index.html`. Handles correct `<\/` script tag escaping so the HTML parser does not truncate content.

---

# ⚠️ Update (2026-07-16, later same day) — read this before trusting anything above about auth/HR

**Note for future agents:** the "Phase 2 Implementation Details" section right above this one was written by a *different* AI tool working on this same repo (Gemini's Antigravity IDE — note the `C:\Users\hashi\.gemini\...` paths in its pack/unpack utility links, which won't exist in a Claude Code environment; use the extract/edit/repackage workflow documented earlier in this file instead). Between sessions, that tool (or the user directly) also built out a **substantial HR + real-authentication backend** that predates none of the "Implementation Status" claims above — specifically, the line "There is no real authentication" and "`get_current_user` always resolves to anonymous/owner" **are now false**. Verified by reading the actual code, not assumed.

## HR backend now exists (built outside this session, verified by direct code review)

Full model → schema → repository → service → router stack for:
- **Employee** (`models/employee.py`) — includes `password_hash`, `access_level` (`owner`/`hr_admin`/`financehead`/`devmember`/`employee`), soft-delete via `deleted_at`.
- **LeaveRequest** / **LeavePolicy** — create, balance calculation (casual/sick/annual vs policy), approve/reject workflow with notifications.
- **JobOpening** / **HiringCandidate** — openings CRUD + candidates as a sub-resource.
- **Holiday** — simple CRUD under HR settings.
- **Notification** — extended to serve HR events (leave submitted/approved/rejected, employee added/updated) alongside the Software Dev notifications from Phase 2.

Routers: `routers/employees.py`, `routers/leaves.py`, `routers/job_openings.py`, `routers/settings_hr.py` (`/api/settings/hr/leave-policy`, `/api/settings/hr/holidays`), all registered in `main.py`.

Permission model (enforced server-side in the service layer, not just UI): create/update employee → `owner`/`hr`/`hr_admin`; delete employee → `hr`/`hr_admin`; leave approve/reject → `hr`/`hr_admin`/`owner`. Salary is redacted in `EmployeeResponse` for personas outside `owner`/`hr`/`hr_admin`/`financehead`.

## Real authentication now exists

- `POST /api/auth/login` — bcrypt password check (`core/security.py`), issues a JWT (`sub`=email, `user_id`, `name`, `role`=access_level).
- `GET /api/auth/me` — **added in this session** (Phase 1 work below); validates the token server-side and returns fresh employee data, used for auto-login on page refresh instead of trusting a client-decoded token.
- `core/dependencies.py`: `get_current_user` was changed (by the other tool/session) to **require** a valid bearer token — it now raises 401 instead of defaulting to `{"sub": "anonymous", "role": "owner"}`. This is a breaking change from what's documented earlier in this file. `get_hr_user` (owner/hr_admin only) and `get_persona_role` (any authenticated user, just extracts role) also exist.
- **Regression this caused, not yet fixed**: `GET /api/settings/currency` was deliberately built public (see the Currency Settings section above) — it now 401s along with everything else, because `get_current_user`'s new strict behavior applies globally. Confirmed via a live no-token request. Needs an endpoint-by-endpoint public/authenticated/role-gated audit (this is literally "Phase 4" in the roadmap below) rather than a blanket fix.

## Seed data / temporary account

`backend/scripts/seed_hr.py` — seeds 21 employees (default password `password123`) plus one explicit temp HR admin account:
- **Email:** `hamzashafiq@theupmotion.online`
- **Password:** `1234`
- **access_level:** `hr_admin`

**This has already been run against the live dev `orbit.db`** — confirmed by querying it directly (21 employees present, including this account). Don't re-run assuming it's a no-op-if-already-seeded check exists (it does — `seed()` skips if `Employee` count > 0 — but no harm double-checking before assuming it needs running).

No Alembic migrations exist for HR (or anything else) — same `Base.metadata.create_all`-only situation as documented earlier in this file.

## The user's 8-phase roadmap (given 2026-07-16) — Phase 1 done, 2-8 pending

The user laid out this explicit sequence and said nothing past Phase 1 should proceed until it's done:

1. **Finish Authentication** ✅ **done this session** — see below.
2. **Remove Persona System** — replace `this.state.persona`, `PERSONA_META`/`ACCESS`/`PERSONA_LANDING`, `personaToEmp`-style lookups with the authenticated employee's id/role/department everywhere. **Not started** — Phase 1 only bridged the minimum needed (see below); the full sweep is still open.
3. **Employees as single source of truth** — replace every remaining `D.employees` (mock) read with the real `employeesApi`/`apiEmployees` data. Confirmed split-brain still exists in: Dashboard payroll, Finance payroll/salary slips, Software Dev employee dropdown, CRM Assigned Rep dropdown, global top-bar search. **Not started.**
4. **Fix Authorization** — endpoint-by-endpoint audit: decide Public (login, currency GET, health, static assets) vs Authenticated (CRM/HR/Finance/Projects/Notifications) vs Role-protected (owner/HR/finance/dev/employee), rather than the current blanket "everything requires a token." **Not started** — this is what will fix the Currency Settings regression above.
5. **Finish HR UI** — Employees, Leave Requests, Hiring, Notifications, Employee Detail, Opening Detail screens should be fully API-driven, no mock arrays. Partially done (list screens load from `apiEmployees`/`apiLeaves`/`apiOpenings` — see Phase 2 section above and the original HR review report), but at least one known gap: the Employee form's "Access level" dropdown (`accessLevelOptions`/`efoAccessLevel`/`onEfoAccessLevel`) references render keys that don't exist in script.js — scaffolded, not wired. Found via a systematic template-binding-vs-renderVals cross-check; there may be others like it in less-exercised screens — worth re-running that check (see "Workflow notes" below) before Phase 5 work.
6. **Login-aware navigation** — role-driven menus (Owner → everything, Dev → My Projects/Tasks/Leave, HR → Employees/Hiring/Leave). **Not started.**
7. **Alembic migrations** — before building more modules. **Not started.**
8. **Update CLAUDE.md** — this entry is partial progress on that.

**Also requested, not yet done:** a technical-debt cleanup pass once the above lands — remove dead persona code, delete obsolete helpers/state, consolidate duplicate API-call patterns, remove `window.ORBIT_APP_DATA` references where a backend equivalent exists, confirm every timestamp uses the PKT helpers, verify no prototype-only paths remain in "completed" modules.

## Phase 1 implementation details (this session, 2026-07-16)

- **Backend**: added `GET /api/auth/me` (see above) — the login screen's HTML/CSS already existed (built by the other tool) but had **zero** corresponding JS — no state, no handler, nothing ever set `orbit_token`. It was completely non-functional; found this via a systematic check (see below).
- **Frontend state added**: `authChecking`, `currentUser`, `loginEmail`, `loginPassword`, `loginLoading`, `loginError`.
- **Auto-login**: `componentDidMount` → `checkAuth()` — if `orbit_token` exists in localStorage, calls `GET /api/auth/me` before rendering the real app (a full-screen splash covers everything during this check, so there's no flash of stale/wrong-persona UI); invalid/expired token → cleared, login screen shown.
- **Login**: `handleLogin` → `POST /api/auth/login` → stores JWT → `onAuthenticated(user)` → `bootAppData(user)` (the renamed/refactored former body of `componentDidMount` — all the `loadXxx()` calls now happen only after real auth succeeds, never before).
- **Logout**: the sidebar already had a `<button class="sidebar-logout-btn">` wired to `{{ handleLogoutClick }}` and gated by `{{ authUser }}` — neither key existed in script.js. Added both (`handleLogoutClick: this.handleLogout`, `authUser: !!this.state.currentUser`) rather than adding a second logout button.
- **Session expiry**: `apiFetch` already stripped the token from localStorage on any 401; added a module-level `onSessionExpired` hook (set in `componentDidMount`) so a 401 anywhere now also flips `currentUser` back to `null` (→ login screen) and shows a toast, instead of just failing that one silent request.
- **Identity replacing persona (the concrete part of "every backend request uses the logged-in user")**: `loadCurrencyPrefs`/`setModuleCurrency` and `loadMyLeaveData` now key off `this.state.currentUser.id` — the latter used to guess via a hardcoded `personaToEmp = {owner: 'emp_owner', ...}` map, which is gone. **Deliberately not done in Phase 1** (this is Phase 2's job): the sidebar/screen access gating still runs through `PERSONA_META`/`ACCESS`/`this.state.persona` — bridged by setting `PERSONA_META[access_level] = {name, role}` from the real logged-in user on auth success, so existing gating logic shows correct info without a full rewrite yet.
- **Bug fixed along the way**: the scaffolded login button used `dc-attr-disabled="{{ loginLoading }}"` — not a real directive in this template runtime (confirmed by checking the loader source), so it would never have actually disabled the button. Changed to the correct `disabled="{{ loginLoading }}"`.
- **Verification**: `GET /api/auth/me` tested end-to-end with `TestClient` (valid token → 200 with fresh employee data; bad/missing token → 401). Frontend logic was verified by static/structural checks only (syntax check + a systematic scan comparing every `{{ ident }}` in the template against renderVals() keys) — **not** exercised in an actual browser, per this project's usual "batch edits, repackage once, no browser testing unless asked" workflow.

## Workflow addition: checking for scaffolded-but-unwired template bindings

Because more than one tool/session has touched this codebase, it's become a real failure mode: template markup gets added (or half-ported) with render keys that don't exist in script.js — they silently render as empty/no-op rather than erroring, so it's easy to miss. Before assuming a screen "works," cross-check it:

```python
import re
tpl = open('template.html', encoding='utf-8').read()
script = open('script.js', encoding='utf-8').read()
idents = set(re.findall(r'\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}', tpl))
missing = [n for n in sorted(idents) if not re.search(r'(?<![A-Za-z0-9_.])' + re.escape(n) + r'\s*[:,]', script)]
print(missing)
```
This caught the entire login screen being dead code, and separately flagged the Employee form's access-level dropdown as the same issue.

## ⚠️ Update (2026-07-16, later same day): HR bug-fix pass (backend crash + 5-item frontend list)

After Phase 1, the user reported a live 500 traceback on `GET /api/job-openings/` plus a combined list of HR bugs/gaps, ending with an explicit "No mock data. All real data." All items below are done and the bundle has been repackaged once (see verification at the end).

**Backend fixes:**
- `job_opening_repository.py`: `find_all`/`find_by_id` used `joinedload(JobOpening.candidates)` (a one-to-many collection) without `.unique()` on the `Result` — SQLAlchemy 2.x raises on this. Added `.unique()` to both. This was the crash in the traceback.
- Notification identity bug: `notifications.py`/`notification_service.py`/`notification_repository.py` were keyed off the fake UI `persona` role string, so an employee's own notifications (`user_id=emp.id`) never reached them. Switched both endpoints (`GET /api/notifications/`, `POST /api/notifications/read-all`) to depend on `get_current_user` (real JWT id + role) and updated the repo/service signatures to accept `role` and expand it to broadcast targets (`hr`/`hr_admin`, `owner`/`admin`, `all`). Verified end-to-end via TestClient: HR gets "Leave Submitted" when an employee applies; the employee gets "Leave Approved"/"Leave Rejected" (with the reason baked into the message) after HR actions it.
- Root cause of "Add employee is not working": the Employee form's Access Level `<Select>` referenced `accessLevelOptions`/`efoAccessLevel`/`onEfoAccessLevel` — none existed in script.js (same scaffolded-but-unwired class of bug as the dead login screen). The design-system `Select` does `options.map(...)` with no null-check, so opening "Add Employee" crashed the whole render tree instantly. Added the missing constant (`ACCESS_LEVEL_OPTIONS`), state field, handler, and render-vals keys; `access_level` is now actually sent on create (previously always silently defaulted server-side to `"employee"`).

**Frontend fixes (template.html + script.js, repackaged once at the end):**
- HR persona (`hr_admin`) no longer has `dashboard` access in `ACCESS` — HR now lands on Employees, not the revenue Dashboard.
- Global search now covers HR: employees, leave requests, and job openings are searched (previously it only ever searched stale mock `D.employees` and had zero leave/hiring coverage). Clicking a result switches to the HR screen, sets the right `hrTab` (`'employees' | 'leave' | 'hiring'`), and opens the relevant record.
- Employee Detail modal: removed the "Documents / Signed contract on file" section entirely (no backing feature existed); relabeled salary to "Monthly salary (PKR)" everywhere (new `moneyPKR()` formatter replaces the old generic `money()` for this field) — this reflects the DB's `salary` field now meaning **PKR per month**, not a USD annual figure; start-date inputs (both the New Employee form and the existing-employee edit field) now have `max={today}` plus a client-side guard in `onEmpStartDate`/`submitNewEmployee` rejecting future dates; leave balance was previously hardcoded to `0/0/0` — now loads real data via the existing `leavesApi.balance(id)` endpoint (`loadEmployeeLeaveBalance`, fired from `selectEmployee`).
- **Change password**: HR can now set a new password for any employee straight from the Employee Detail modal (`changePasswordDraft` state + `submitChangePassword` → `employeesApi.update(id, {password})` → success toast "Password changed successfully."). Verified end-to-end (TestClient): password changed by HR, old password rejected, new password logs in.
- **Leave approve/reject**: replaced the native `prompt()` for rejection with a proper small modal (`leaveActionModal` state, `crm-pop`/`crm-overlay-fade` animation classes) that lets HR add a note on approve (optional) or a reason on reject (required) — both flow through to the employee's notification message (backend already supported `note`/`rejection_reason`, just wasn't exposed well in the UI). Same success-toast pattern as password change.
- Leave request rows: already had a working `onOpen` row-click plus `cursor:pointer`, just no visual cue — added a "Click for details →" hint in the actions column for non-pending rows (pending rows already show Approve/Reject there).
- New Opening creation now validates all fields (title, department, salary bracket, experience, description) before allowing submit — previously only checked `title`.
- Animation polish: added `crm-overlay-fade`/`crm-panel-slide` (existing CSS classes, already used by CRM Leads) to the Employee, Leave, and Opening drawers/modals, which previously popped in with no transition at all.

**Data:** DB was wiped and reseeded with Pakistani names top-to-bottom (`backend/scripts/seed_hr.py`) — 20 employees + the `hamzashafiq@theupmotion.online` / `1234` HR admin account (kept as-is, already a Pakistani name) + matching candidates/notifications. Salaries in the seed are now realistic **PKR/month** figures (e.g. owner ~450,000/mo) instead of the old USD-annual numbers, consistent with the Monthly-salary-PKR relabel above. Added `backend/scripts/wipe_hr.py` (delete-all for the 7 HR tables, FK-order-safe) since no such utility existed before — reseeding required wiping first (`seed_hr.py` no-ops if `employees` is non-empty). **The live `orbit.db` was backed up first** to `backend/orbit.db.bak-before-hr-reseed-<timestamp>` before wiping, per this project's standing safety practice.

**Verification method** (same as always — no browser, no formal test suite): FastAPI `TestClient` against the real seeded `orbit.db` for read-only checks, and a throwaway `sqlite+aiosqlite` DB (`DATABASE_URL` override) for anything that mutates data, so no test artifacts leak into the live DB. Confirmed in one pass: HR login → employees list (21) → job-openings (200, no crash) → leave reject with reason (creates employee notification with reason text) → leave approve with note → employee login → employee sees "Leave request approved" notification → HR changes employee password (PUT, not PATCH — `/api/employees/{id}` only supports PUT) → employee logs in with the new password.

**Still open / explicitly deferred** (not part of this message's ask; the user's own Phase 2–8 roadmap above still governs sequencing): full persona removal, single-source-of-truth employees everywhere else in the app (Dashboard payroll, Finance, Dev dropdowns, CRM assigned-rep), the Currency-Settings-GET auth regression, role-driven navigation, Alembic migrations, and the broader technical-debt sweep.

### Follow-up fix (same day): a second, different 500 crash on `POST /api/job-openings/`

After the fix above, creating a new opening from the UI still crashed with `sqlalchemy.exc.MissingGreenlet` inside `job_opening_service.py`'s `_to_response()`, at `len(opening.candidates)`. Different root cause from the `.unique()` bug: `job_opening_repository.py`'s `create()` and `update()` built/mutated the `JobOpening` object and then called `await self.db.refresh(opening)` — plain `refresh()` only reloads column attributes, so `opening.candidates` (a relationship) is left unloaded/expired. Accessing it afterward in a synchronous method triggers an async lazy-load outside an active greenlet context, which raises instead of silently working (as it would in sync SQLAlchemy). `find_all`/`find_by_id` never hit this because they eager-load `candidates` via `joinedload(...).unique()` in the same query.

**Fix**: changed both `create()` and `update()` to `await self.db.flush()` then `return await self.find_by_id(opening.id)` instead of `db.refresh(opening)` — reuses the already-correct eager-loading path so `candidates` is always populated before `_to_response` touches it. This also silently fixes the same latent risk in `update_opening` (e.g. closing an opening), which had the identical bug but hadn't been hit yet.

Verified via TestClient against a throwaway DB: create → 201 with `candidate_count: 0`; update (`status: "Closed"`) → 200. Also confirmed the live `orbit.db` has no stray row from the user's failed attempt — the whole request is one transaction, so the crash's implicit `ROLLBACK` discarded the INSERT along with the notification it had already written.
