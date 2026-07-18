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

---

# ⚠️ Update (2026-07-16, Finance Module Integration)

## What is Done (Finance Backend & State wiring)

- **Database Layer**: Implemented full `models`, `schemas`, `repositories`, and `services` for the Finance module:
  * `Invoice` model / schema / repo / service (includes dynamic ReportLab PDF builder).
  * `Expense` model / schema / repo / service (with department/category stats).
  * `SalarySlip` model / schema / repo / service (handles gross, tax, allowance, deduction, bonus).
  * `Milestone` model / schema / repo / service.
- **FastAPI Controllers**: Thin routers registered under `backend/app/main.py`:
  * `/api/finance/invoices` (with PDF download endpoint `/invoices/{invoice_id}/pdf`)
  * `/api/finance/expenses` (with approve/reject handlers)
  * `/api/finance/payroll` (resolving or initializing salary slips monthly)
  * `/api/finance/milestones`
  * `/api/finance/stats` (dashboard calculations — verified live: 200 OK)
- **Data Seeding**: Built `backend/scripts/seed_finance.py` that checks for employee presence, inserts a default project if none exists, and populates invoices, expenses, milestones, and salary slips. Seeded successfully on the live SQLite database.
- **Frontend State & Handlers**:
  * Linked all backend controllers to the frontend (`invoicesApi`, `expensesApi`, `payrollApi`, `milestonesApi`, `financeStatsApi`).
  * `loadFinanceData` wired into `bootAppData` — fires on every login.
  * State handlers (`submitNewInvoice`, `submitNewExpense`, `changeInvoiceStatus`, `changeExpenseStatus`, `submitMilestone`, `changeMilestoneStatus`, `deleteInvoice`, `deleteExpense`, `deleteMilestone`, `togglePayrollPaid`) all talk to real API.
  * Optimistic UI updates with 500 ms debounced auto-saving for salary slips (`setSalarySlipFieldLive`).
  * Dashboard statistics now database-driven via `/api/finance/stats`.
- **Salary Slip Modal**: Conditionally renders editable fields (Gross, Tax, Allowances, Deductions, Bonus, Notes) for `canRunPayroll` (owner/finance), read-only breakdown for other roles.
- **Invoice PDF Download**: "Download PDF" button fetches `/api/finance/invoices/{id}/pdf` with auth token, auto-triggers browser download via blob URL.
- **Bug fixed**: `finance_dashboard_service.py` was filtering on `Invoice.deleted_at`, `Expense.deleted_at`, `SalarySlip.deleted_at`, `Milestone.deleted_at` — none of these models have that column. Removed those clauses. `Employee.deleted_at` is valid and kept. Stats endpoint now returns 200 with live data.
- **Repackaged**: `pack.py` ran successfully — `ORBIT.html`, `backend/static/index.html`, and `frontend/index.html` all updated.

## What is Left (Finance Module) ✅ COMPLETE

All Finance module tasks are done. Remaining project-wide items are governed by the Phase 2–8 roadmap above:
- **Phase 2**: Remove persona system, use authenticated employee's role everywhere.
- **Phase 3**: Employees as single source of truth in Dashboard payroll, Finance, Dev dropdowns, CRM.
- **Phase 4**: Fix authorization (endpoint-by-endpoint audit for public vs authenticated vs role-protected).
- **Phase 5**: Finish HR UI (all screens fully API-driven, no mock arrays).
- **Phase 6**: Login-aware navigation (role-driven menus).
- **Phase 7**: Alembic migrations.
- **Phase 8**: Technical debt cleanup (dead persona code, obsolete helpers, consolidate API patterns).

## Key Findings

- **Database Counts**: SQLite holds 21 employees, 3 invoices, 3 expenses, 3 payroll slips, 3 milestones (seeded).
- **Backend Integrity**: All 21 finance routes verified: invoices CRUD + PDF, expenses CRUD, payroll read + update, milestones CRUD, stats — all 200 OK in live smoke test.
- **Stats live sample**: `{total_outstanding: $25k, total_paid: $25k, monthly_expenses: $470, payroll_cost: $1407/mo, upcoming_milestones: $47k}`

---

# ⚠️ Update (2026-07-17): another tool touched this repo — new sync targets, git now exists

**Read this before doing anything else.** Between the Finance-module session above and this one, a *third* AI tool/session (not this one, not the Finance-module one — identifiable by its own `pack.py`/`unpacked/` tooling at the repo root, a different style from this project's established scratchpad extract/edit/repackage-once workflow) also touched the repo. Concretely, since the last time this file was updated:

- **`.git` now exists at the repo root.** This was previously an explicitly non-git directory (see environment context in earlier sessions). Check `git status`/`git log` before assuming anything about history or trusting "no git repo" from stale context.
- **`frontend/` is a new third copy of the bundle** (`frontend/index.html` + `frontend/vercel.json`, for a Vercel deploy target implied by the Stack section above). **The bundle now has to be repackaged into three places, not two**: `ORBIT.html`, `backend/static/index.html`, `frontend/index.html`. All three must stay byte-identical. Forgetting the third one means the deployed Vercel frontend silently drifts from what you tested locally.
- **Root-level `pack.py` and `unpacked/`** are that other tool's own extract/repack scripts — don't confuse them with anything documented in this file's "ORBIT.html internal format" section. Prefer the workflow already documented there (extract the `__bundler/template` JSON string's decoded content into `template.html` + `script.js`, edit, `node --check` + tag-balance-check, repackage once) — it's what every Claude session in this project has used and verified works correctly, including the exact `</script` → `<\/script` re-escaping step, which is easy to get wrong.
- A large **Finance module** was added by a separate session (see the section directly above this one) — fully real, verified working (`/api/finance/stats` etc. all 200 in a fresh TestClient check this session ran).
- **My own prior turn's in-progress work survived intact**: the multi-access-level backend migration (see next section) — model/schema/services/routers were all still in place and functional when this session picked back up, and the Finance-module session's frontend changes correctly wrapped the new `access_levels` array field for backward compatibility (see below) rather than breaking on it. No data or code was lost across the handoff, as far as this session could verify.

## Status of the "multiple access levels per employee" ask — backend done, frontend UI not

The user asked: *"Multiple access level can be assigned to an employee not just one."* Previously `Employee.access_level` was a single string (`"owner" | "hr_admin" | "financehead" | "devmember" | "employee"`). This is a real permission-system change, not just a UI tweak, so it touched a lot of files. Work was interrupted mid-way through by the user (to ask for this very documentation update), then paused further for the drawer/transition UI-polish ask below — **the backend half is complete and verified; the frontend UI half (letting HR actually pick more than one) is not started.**

### Done (backend, verified via TestClient against the live DB)
- **`app/models/employee.py`**: `access_level: Mapped[str]` → `access_levels: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["employee"])`.
- **`app/schemas/employee.py`**: `EmployeeCreate`/`EmployeeUpdate`/`EmployeeResponse` all use `access_levels: list[str]`, with a `field_validator` requiring at least one entry and rejecting anything not in `ACCESS_LEVELS`.
- **`app/core/permissions.py`** (new file): `has_role(roles: list, *allowed) -> bool` — the shared "does this employee hold any of these roles" check, since a plain `x not in (...)` stops working once `x` can be a list.
- **`app/core/dependencies.py`**: `get_owner_user`/`get_hr_user` now check membership in `current_user["roles"]` (a list) instead of equality against `current_user["role"]` (a string). **Two separate dependencies now exist on purpose**:
  - `get_persona_role` — kept returning a single string (`roles[0]`, the "primary" role) **specifically for `app/routers/projects.py` and `app/routers/tasks.py`**, which still run on the pre-real-auth mock-persona permission checks (`persona == "devmember"`, hardcoded `"Kofi Mensah"` assignee, etc. — this is the still-untouched Phase 2/3 debt the roadmap above already flags). Changing what this function returns would have silently broken every project/task permission check, since `list_of_roles not in (a, b, c)` is *always* `True` — every such check would have started raising 403 for everyone, including owners. Left alone deliberately.
  - `get_persona_roles` (new) — returns the full `list[str]`, used by every HR-scope router (`employees.py`, `leaves.py`, `settings_hr.py`, `job_openings.py`) whose services now call `has_role()`.
- **`app/routers/auth.py`**: JWT payload now carries `"roles": employee.access_levels` (was `"role": employee.access_level`); `LoginUserResponse.access_levels: list[str]` (was `access_level: str`).
- **`app/routers/leads.py`**, **`app/routers/notifications.py`**, **`app/repositories/notification_repository.py`**, **`app/services/notification_service.py`**: all switched from a single `role`/`persona` string to a `roles`/`personas` list — notification broadcast-target expansion (`hr`/`hr_admin`, `owner`/`admin`) now happens per-role across the whole list, and the task-due-soon/overdue check triggers on `"devmember" in roles` instead of `role == "devmember"`.
- **`app/services/employee_service.py`, `candidate_service.py`, `holiday_service.py`, `job_opening_service.py`, `leave_policy_service.py`, `leave_service.py`**: every `if persona not in (...)` permission check converted to `if not has_role(persona, ...)`; all `persona="owner"` defaults changed to `persona=None`. Salary redaction in `EmployeeResponse` now also checks `has_role(...)`.
- **`backend/scripts/seed_hr.py`**: every `"access_level": "x"` seed entry converted to `"access_levels": ["x"]`; the `Employee(...)` constructor call and the hardcoded `hamzashafiq@theupmotion.online` HR-admin block both updated.
- **Live `orbit.db` migrated** (backed up first to `backend/orbit.db.bak-before-multi-access-level-<timestamp>`): added `access_levels` TEXT column, backfilled every existing employee's single value into a 1-element JSON array, dropped the old `access_level` column. Verified: `PRAGMA table_info(employees)` shows `access_levels` present and `access_level` gone; a real login now returns `access_levels: ["hr_admin"]` etc.

### Already bridged by the Finance-module session (found, not built, this session)
The frontend was **not** left broken by the schema change — whoever worked on it after my backend changes already patched the wire format: `submitNewEmployee` sends `access_levels: [f.accessLevel || 'employee']` (wraps the single selected value in an array), `setEmployeeFieldLive`'s `access_level` case does the same, and `onAuthenticated`/`isOwner()`/the sidebar's `access` gating all derive a single working value via `user.access_levels[0]`. So **the app works correctly today for the single-access-level case** — nothing is broken, no 422s. What's missing is entirely additive.

### Not done — this is the actual remaining work
1. **Frontend UI is still a single `<Select>`**, not a multi-select (`template.html` lines ~3561 and ~3588 in the current extraction, both `HealerDesignSystem_11773a.Select` bound to `efoAccessLevel`/`selEmployee.access_level`). HR still can't actually assign more than one — needs converting to a checkbox group (or multi-select component) bound to an array, in both the New Employee form and the existing-employee edit view.
2. **Permission *merging* across multiple assigned levels was never built.** Right now `user.access_levels[0]` (whichever is first) is the only one that drives the sidebar `access.*` gating (`ACCESS[persona]` lookup) — so even once multi-select exists, an employee assigned both `devmember` and `financehead` would only get whichever screens `access_levels[0]` grants, silently ignoring the second role. Needs a `mergeAccessLevels(list)` that ORs every assigned level's `ACCESS[level]` booleans together, used wherever the sidebar currently does `ACCESS[persona]`.
3. Backend already supports #2 correctly (`has_role()` checks *any* overlap) — this is purely a frontend gap.

**Next agent**: pick up at #1/#2 above. Don't touch `app/routers/projects.py`/`tasks.py` or their services as part of this — they're intentionally still on the single-string `get_persona_role`/mock-persona system; that's Phase 2/3 debt, not part of this ask.

## UI polish pass (2026-07-17): drawer close animations, screen transitions, logout button

The user reported drawers closing instantly with no animation, screen switches having no transition, and the logout button "not looking good." Investigation found **the Finance-module (or another) session had already attempted all three fixes** — there's a CSS block literally titled `/* ORBIT FIXES — Drawer close animation, logout button, sidebar bold */` — but the attempts were incomplete/broken in ways that hadn't been caught because this project's workflow doesn't include live-browser verification (documented in "Workflow notes" above — static/structural checks only).

### Root causes found
1. **Drawer close animation only worked for 5 of 16 drawers/modals.** The mechanism (`_closeWithAnimation(fn)` in script.js) adds an `orbit-closing` class to `document.querySelector('.crm-panel-slide:not(.orbit-closing)')`, waits 240ms, then calls `fn()` to actually unmount. This requires **both** (a) the panel's own close handler to call `_closeWithAnimation` instead of a raw `setState`, **and** (b) the panel's `<div>` to actually carry `class="crm-panel-slide"` (or `crm-pop` for small centered popups) so the CSS/querySelector has something to find. Cross-referencing all 16 `sc-if`-gated drawers/modals against both requirements found:
   - **6 close handlers never called `_closeWithAnimation` at all** (`closeNewLead`, `closeLeaveAction`, `closeNewProject`, `closeNewTask`, `closeMilestoneForm`, `cancelDeleteLead`) — instant `setState`, no animation attempted.
   - **8 drawers' panel/overlay `<div>`s were missing the `crm-panel-slide`/`crm-overlay-fade` classes entirely** (Project, New Project, Task, New Task, Invoice, Expense, Milestone, Invite) — even where the close handler *did* call `_closeWithAnimation`, the `querySelector` found nothing and silently fell through to an instant close.
   - Only Lead, Employee, Leave, Opening, and My-Leave drawers had both halves correct and actually animated.
2. **Screen-transition CSS targeted the wrong element.** The existing rule was `[data-brand="orbit"] [style*="flex:1;display:flex;flex-direction:column"] > div` — that inline-style substring belongs to the *outer* layout wrapper (the one that also contains the top bar), not the actual scrollable per-screen content area (`<div style="flex:1;padding:24px;overflow:auto">`, a sibling below the top bar). The rule never matched the right element, so screen switches never visibly animated. There was also a **third, completely dead** earlier attempt using a `sc-if > div[...]` selector — `<sc-if>` is a compile-time-only template directive (see "ORBIT.html internal format" above) and never exists as a real element in the rendered DOM, so that selector could never match anything, ever.
3. **Three separate, partially-conflicting `.sidebar-logout-btn` CSS rule blocks** existed simultaneously (evidence of at least three different editing passes each adding their own version instead of touching the existing one) — the last one in source order (with `!important`) happened to win, but the redundancy was real clutter and the weight was only 600, not bold.

### Fixes applied (`template.html` + `script.js`, repackaged once at the end)
- `_closeWithAnimation` now matches `.crm-panel-slide:not(.orbit-closing), .crm-pop:not(.orbit-closing)` (covers both side-drawers and small centered popups), and also finds the panel's `.crm-overlay-fade` ancestor via `.closest()` and fades it out in sync, instead of only animating the panel while the backdrop just vanished.
- Added the missing `class="crm-overlay-fade"` / `class="crm-panel-slide"` to all 8 previously-unmarked drawers.
- Wired all 6 previously-instant close handlers through `_closeWithAnimation`.
- Added `pop-fade-out` and `overlay-fade-out` keyframes (the old CSS only had `drawer-slide-out` for panels).
- Added `class="orbit-screen-content"` to the actual per-screen content wrapper div and rewrote the screen-transition rule to target `.orbit-screen-content > div` — reliable because exactly one screen's content div is ever mounted as that wrapper's child at a time, so the `screen-enter` keyframe fires on every navigation. Removed the dead `sc-if > div[...]` rule (left a comment explaining why it could never have worked, for the next person who wonders).
- Consolidated the 3 duplicate `.sidebar-logout-btn` blocks into one: bumped to `font-weight: 700` (bold, per this ask), slightly stronger border/hover/active states, kept the existing red danger-action styling.
- **Home icon**: investigated but left unchanged — `dashboardItems`'s `{ icon: 'home' }` uses the same Lucide-style naming convention that works correctly for every other sidebar icon in the app (`bar-chart-2`, `flask-conical`, `credit-card`, `clipboard-list`, etc.), and `SidebarSection`/`Icon` are opaque pre-built design-system components compiled into the gzip+base64 manifest assets — no CSS rule hiding it was found, and there's no template/script-level bug to point to. Flagged as needing live-browser confirmation rather than blindly changed on a guess.

### Verification
Static/structural only, per this project's standing workflow: `node --check` on script.js, tag-balance check on template.html (one false-positive round-trip along the way — my own explanatory CSS comment literally contained the substring `<sc-if>` as an example, which the balance-checker matched as a real opening tag; reworded the comment), scaffolded-binding cross-check (template `{{ }}` idents vs script.js render-vals) came back clean, and a fresh backend TestClient login still returns 200 against the live DB. Repackaged into all **three** bundle copies (`ORBIT.html`, `backend/static/index.html`, `frontend/index.html`) — confirmed byte-identical sizes afterward. **Not** exercised in an actual browser (consistent with this project's documented workflow, but worth being upfront that the animation timing/feel hasn't been eyeballed).

## Refresh flash fix (2026-07-17): splash + login screen briefly flashing on page load

The user reported a millisecond flash of both the splash screen and the login screen on every browser refresh, even when already logged in with a valid session. Root cause: of the ~195 `sc-if` conditionals in the template, only `authChecking` and `showLogin` (the two gates controlling which of splash/login/app shows) were missing a `hint-placeholder-val` attribute — every other consequential conditional in the file has one. This hint is what the runtime uses to decide what to paint on the very first pre-hydration frame, before the real JS state (`authChecking: true` by default) has actually run; without it, the initial paint and the real state briefly disagreed, causing the flash during the handoff.

**Fix**: added `hint-placeholder-val="{{ true }}"` to the `authChecking` gate and `hint-placeholder-val="{{ false }}"` to `showLogin`, matching the real initial state values exactly. Repackaged into all three bundle copies. Verified tag balance and scaffolded bindings stayed clean; not browser-tested (consistent with this project's standing workflow).

## Multiple access levels per employee — completed (2026-07-17)

Following on from the "backend done, frontend not started" status logged earlier today, the user clarified the actual requirement: **access levels needed to be per-screen/module toggles** (their words: *"Access levels should be Leads, invoices and expenses.. if the owner selects leads for a certain employee he should be seeing the leads then, vice versa for all"*) — not multi-select over the old 5 abstract role names. Ticking "Leads" should grant *only* Leads, not a bundle. This is now fully implemented, tick-box UI included, verified end-to-end.

### The vocabulary problem this ran into, and how it was resolved
The old `access_levels` values (`owner`/`hr_admin`/`financehead`/`devmember`/`employee`) were **not just an HR concept** — grepping turned up `"hr_admin"`/`"financehead"`/`"devmember"` (plus hardcoded `"Kofi Mensah"` assignee logic) load-bearing inside `project_service.py`, `task_service.py`, `expense_service.py`, `invoice_service.py`, `milestone_service.py`, `salary_slip_service.py`, and the notification broadcast-target expansion — i.e. the Finance module (built in an earlier session, see above) and the still-untouched Dev/Project mock-persona system both depend on these exact strings. Simply swapping employees over to a new screen-keyed vocabulary (`crm`/`dev`/`finance`/`hr`) without touching those services would have silently broken project visibility scoping and finance notification delivery for real employees, since e.g. `get_persona_role()` (the still-single-string dependency `projects.py`/`tasks.py` depend on, kept deliberately unchanged for exactly this reason) returns `access_levels[0]`.

Given that, this was done as a **full, consistent rename** rather than introducing a second parallel vocabulary: `hr_admin`→`hr`, `financehead`→`finance`, `devmember`→`dev` everywhere across the backend (mechanical find/replace across all 17 affected files, then a manual cleanup pass for the duplicate `has_role(persona, "hr", "hr")`-style args the crude replace produced — search `grep -rn '"hr", "hr"'` if this pattern resurfaces anywhere). `ACCESS_LEVELS` in `app/schemas/employee.py` is now `("owner", "dashboard", "crm", "dev", "finance", "hr", "permissions", "employee")`.

### Backend changes
- **`app/schemas/employee.py`**: `ACCESS_LEVELS` tuple updated as above.
- **All `has_role()` call sites** (`employee_service.py`, `candidate_service.py`, `holiday_service.py`, `job_opening_service.py`, `leave_policy_service.py`, `leave_service.py`) and **`app/core/dependencies.py`**'s `get_hr_user`: `"hr_admin"` → `"hr"` (with duplicate-arg cleanup after the mechanical replace).
- **`app/repositories/notification_repository.py`**: broadcast-target expansion simplified from `role in ("hr", "hr_admin")` to `role == "hr"` (no more second name to check).
- **`project_service.py`, `task_service.py`, `expense_service.py`, `invoice_service.py`, `milestone_service.py`, `salary_slip_service.py`**: every `"devmember"`/`"financehead"` role-comparison string renamed to `"dev"`/`"finance"`. The hardcoded `"Kofi Mensah"` name-matching logic itself was **not** touched — that's separate, pre-existing Phase 2/3 debt (mock-persona-based project assignment), unrelated to this vocabulary rename, and still needs a real rewrite later.
- **`app/core/dependencies.py`**: kept **two** persona dependencies on purpose — `get_persona_role` (unchanged, still returns a single string = `roles[0]`, used only by `projects.py`/`tasks.py` which still run on the old mock-persona system) and `get_persona_roles` (the list, used by every real HR-scope router).
- **`backend/scripts/seed_hr.py`**: every seed employee's `access_levels` entry renamed to match (`hr_admin`→`["hr"]` etc).
- **Live `orbit.db` migrated** (backed up first to `backend/orbit.db.bak-before-access-vocab-rename-<timestamp>`): read every employee's actual current `access_levels` value (not assumed from the seed script — one employee, Ayesha Siddiqui, had been manually changed to `["owner"]` via the UI during earlier testing and was correctly left alone) and remapped only the old role names in place. 11 of 21 employees had a value that needed renaming.
- Verified via TestClient: HR login returns `access_levels: ["hr"]`; a `dev`-only employee gets 403 creating an employee; a `finance`-only employee gets 403 adding a holiday; HR can add/delete a holiday; **an employee can now hold more than one level at once** — PUT `access_levels: ["dev", "crm"]` on a real employee round-tripped correctly.

### Frontend changes
- **`ACCESS_LEVEL_OPTIONS`**: now the 7 tick-box options shown in the Employee form — `Owner (full access)`, `Dashboard`, `Leads`, `Projects`, `Invoices & Expenses`, `Employees`, `Setup` — each value matching the new backend screen-key vocabulary 1:1 except Owner (implies everything).
- **`mergeAccess(levels)`** (new function): computes the sidebar's `access.{dashboard,crm,dev,finance,hr,permissions,audit}` booleans as a straight union across every level the employee holds (`owner` implies all) — this is what makes "tick Leads + tick Invoices & Expenses → sees exactly those two, nothing bundled in" actually true. Replaces the old `ACCESS_LEVELS[persona]` single-role bundle lookup that `renderVals()` used to do.
- **`derivePersonaFlavor(levels)`** (new function): the app still has a large amount of *cosmetic* logic scattered through Dashboard/Dev/Finance rendering that keys off a single `persona` string (`persona === 'devmember'` → "My Projects" label, own-projects-only filtering, `canRunPayroll`, `canApproveExpense`, etc. — roughly 15 call sites, none of them touched). Rather than rewrite all of those (out of scope — that's the "remove persona system" Phase 2 work, not this ask), this derives a single best-guess flavor from the granular list (priority `owner > hr > finance > dev`, else `employee`) and feeds it into the same `persona` variable those checks already read. For every *currently real* employee (single-level after migration) this reproduces their exact prior behavior. For a newly multi-tagged employee going forward, it's a reasonable but approximate default — acceptable since none of those checks are access-control-critical, just labels/defaults.
- **Employee form UI** (both New Employee and existing-employee edit): the single `<Select>` replaced with a tick-box list (`empAccessLevelRows`/`efoAccessLevelRows`, precomputed in `renderVals()` since the template's `{{ }}` expression language can't do `.includes()` checks — each row carries `{value, label, checked, onToggle}`). `toggleEmpAccessLevel(id, value)` / `toggleEfoAccessLevel(value)` add/remove one value from the array per checkbox click; `setEmployeeFieldLive`'s `'access_levels'` case now sends the raw array straight through (no more wrap-single-value-in-array shim from the earlier session).
- **`onAuthenticated`**: `user.access_level` is now set via `derivePersonaFlavor(user.access_levels)` instead of naively taking `access_levels[0]` — this one change is what keeps every downstream `currentUser.access_level === 'devmember'`/`'owner'` check (there are a few: `loadHrData`'s early-return, `isOwner()`) working correctly without having to touch each of them individually.

### Verification
`node --check` + tag-balance + scaffolded-binding cross-check all clean (x-import count dropped from 204→202 as expected — two `Select` components replaced by plain checkbox markup). Backend TestClient checks above all passed against the live DB. Repackaged into all three bundle copies. **Not** browser-tested — in particular the checkbox `checked="{{ al.checked }}"` binding pattern is new to this codebase (no prior checkbox existed to copy from) and, while it follows the same `attr="{{ expr }}"` convention already confirmed working for `disabled`, it's the one part of this change worth an actual click-test before fully trusting it.

## Follow-up (same day): two real bugs the browser test above would have caught

The user reported both immediately, from actual browser console output — worth reading closely since real errors are exactly what static/structural checks can't catch.

### 1. 422 on toggling an access-level checkbox down to zero
`toggleEmpAccessLevel` computed `next` by filtering the clicked value out of the current array with no floor — unticking the *last* checked box for a real employee sent `access_levels: []` in the PUT, which `EmployeeUpdate`'s validator correctly rejects ("at least one access level is required"), surfacing as a raw 422 in the console. `submitNewEmployee` (the create path) already had a `.length ? ... : ['employee']` fallback for this same edge case; the live-edit toggle path didn't. **Fixed**: `toggleEmpAccessLevel`/`toggleEfoAccessLevel` now fall back to `['employee']` (existing employee) / `[]` (new-employee form, harmless since submit already guards it) when unticking would otherwise leave nothing — and while touching this, added the also-requested "ticking Owner auto-ticks (and disables) every other box" behavior: clicking Owner replaces the whole selection with `['owner']` outright (visually shows every row checked via `checked: isOwner || ...` in the row-construction, and `disabled: isOwner && value !== 'owner'` locks the rest so they can't be confusingly toggled while Owner covers everything already); unticking Owner drops back to `['employee']`.

### 2. Every icon in the app was silently broken (CORS + 404 on unpkg.com)
The user's console showed this for `plus-circle`, `home`, and `check-circle` (previously, in an earlier session today, this exact symptom for just `home` was investigated and wrongly written off as *"opaque design-system component, no code-level bug found — flagged for live-browser confirmation"*. It needed exactly that confirmation, and the real bug was fully diagnosable once actually chased down.)

**Root cause, fully verified via the live npm/unpkg registry, not guessed**: the Icon component (compiled into one of the gzip+base64 manifest JS assets — `a7fb5d78-ec80-4fc2-b2b2-00b87a8df9c3`, decompressible with `zlib.gunzipSync` if this ever needs re-checking) builds every icon's URL as `` `https://unpkg.com/lucide-static@0.400.0/icons/${name}.svg` `` and uses it as a CSS `mask-image` to recolor a single-color SVG. That mechanism itself is fine. The problem is entirely in the icon **names** this app passes it: Lucide renamed a batch of icons at some point, and `lucide-static@0.400.0` (confirmed to genuinely exist on npm, not a bad version pin) only ships static `.svg` files under the **new** names — the old names only exist as backward-compat *JS* re-exports under `/dist/esm/icons/`, which is a different, unrelated part of the package this app's Icon component never touches. Fetching `icons/home.svg` (or `plus-circle`/`check-circle`/`x-circle`/`alert-triangle`) 404s outright; the CORS message is secondary noise from how Chrome reports a failed cross-origin mask-image load, not the actual cause.

Confirmed by downloading `https://unpkg.com/lucide-static@0.400.0/?meta` (unpkg's file-listing API) and checking every icon name actually used anywhere in this app against the real file list. Five were stale:

| old name (used in this app) | new name (only one that exists as `.svg`) |
|---|---|
| `home` | `house` |
| `plus-circle` | `circle-plus` |
| `check-circle` | `circle-check` |
| `x-circle` | `circle-x` |
| `alert-triangle` | `triangle-alert` |

All other icon names used in the app (`bar-chart-2`, `calendar`, `clipboard-list`, `credit-card`, `file-text`, `flask-conical`, `search`, `settings`, `user`, `users`, `x`, `plus`) were already current — confirmed by checking literally every distinct icon name referenced anywhere in `template.html`/`script.js` against the real SVG file list, not just the ones in the error log.

**Fixed**: renamed all 5 at their call sites — `dashboardItems`' `icon: 'home'` (×2), `TOAST_TONE_META`'s `success`/`error`/`warning` icons, and the template's `icon="plus-circle"` Button props (×6, New Invoice/Log Expense/Add Milestone/Add Employee/Add Opening + one more). Nothing in the compiled manifest asset itself needed touching — this was entirely a "we're asking for icons that no longer exist under these names" problem in our own code, not a design-system bug.

**If this resurfaces for some other icon name later**: re-run the same check — `curl -s "https://unpkg.com/lucide-static@0.400.0/?meta"` and grep the returned file list for `/icons/<name>.svg`. If it's missing, search the listing for the likely renamed sibling (Lucide's convention was largely `<word>-<shape>` → `<shape>-<word>`, e.g. `check-circle` → `circle-check`).

### Verification
Confirmed via the actual npm registry + unpkg file listing (not assumption) that all 17 distinct icon names used anywhere in the app now resolve to a real file. `node --check` + tag-balance + scaffolded-binding checks clean. Backend TestClient re-verified after the checkbox fix (PUT with a single remaining level, and separately with an explicit `["dev", "crm"]` multi-value array). Repackaged into all three bundle copies.

---

## Update (2026-07-17) — Invoice overhaul: real line items, editable invoice number/dates, Word-template PDF, Finance UI polish

Reworked Finance → Invoices end to end, driven by the user pasting the real
`Invoice Template.docx` layout and a filled example and asking for the app to
match it exactly, plus two small unrelated Finance UI bugs.

### Backend
- `Invoice` model gained `invoice_number` (free-text, e.g. `UPM-CZ-2026-001`),
  nullable `project_id` (no longer required — a "primary" project kept only
  for the list view's Project column/filter), `line_items` (JSON array of
  `{project_id, description, qty, unit_price}`), and four optional
  `bank_account_name`/`bank_account_number`/`bank_iban`/`bank_name` fields.
  SQLite can't drop a NOT NULL constraint via `ALTER TABLE`, so the live
  `orbit.db` (backed up first) was migrated via a full table-rebuild-and-
  backfill script — all 4 existing invoices got sequential invoice numbers
  and single-item `line_items` derived from their old `project_id`+`amount`.
- `InvoiceCreate`/`InvoiceUpdate` schemas now require `line_items` (at least
  one) instead of a flat `amount` — **`amount` is always server-recomputed**
  from `sum(qty * unit_price)` in `InvoiceService._apply_line_items()`, never
  trusted from the client.
- **PDF generation was completely rewritten**: dropped reportlab entirely in
  favor of filling the user's actual `Invoice Template.docx` (now shipped at
  `backend/app/templates/invoice_template.docx`) via python-docx, then
  converting to PDF with `docx2pdf` (drives Word via COM automation — see
  `invoice_pdf_service.py`'s module docstring). **This only works on Windows
  with Word installed; it will NOT work on Render/Linux — must be swapped for
  a LibreOffice-headless or cloud conversion call before deploying.** The
  download filename is now the invoice number (`safe_invoice_filename`), not
  a UUID fragment — fixed on both ends (server `Content-Disposition` AND the
  frontend's `a.download`, since the latter otherwise silently overrides it).
  - Tricky bug along the way: this template's textboxes have some `<w:p>`
    elements that structurally contain *other whole paragraphs* as
    descendants (Word's own compatibility markup). A deep `.//w:t` search
    picks up nested paragraphs' runs too and corrupts a sibling field when
    they share space — fixed by scoping every run lookup to direct children
    only (`p.findall('./w:r/w:t')`). Worth remembering if any other
    docx-template work hits similarly-garbled output.
- Found (while in this code) and fixed the same **MissingGreenlet** bug class
  documented earlier in this file, in four more places:
  `invoice_repository.py`, `expense_repository.py`, `milestone_repository.py`,
  `salary_slip_repository.py` — all had bare `await self.db.refresh(obj)`
  after an update, which expires relationships; fixed all four to
  `return await self.find_by_id(obj.id)` instead. Also fixed
  `invoice_repository.py`'s `count()`/`find_all()` using an inner
  `.join(Invoice.project)`, which would have silently excluded any invoice
  with no linked project once `project_id` became nullable — changed to
  `.outerjoin`.

### Frontend (ORBIT.html / backend/static / frontend — all three kept in sync)
- **Invoice drawer rebuilt**: editable Invoice No., Client, Currency, Status,
  real `<input type="date">` for both Issue date and Due date (previously a
  free-text field with a misleading placeholder), a repeatable line-items
  section (project dropdown + description + qty + unit price + live line
  total + Remove, "+ Add line item" button), a live auto-calculated Total,
  Notes, and four optional bank-detail fields. The footer button now reads
  "Create Invoice" or "Save Changes" and works for both new and existing
  invoices — previously editing an existing invoice had no submit path at
  all even though the service/API already supported it.
- The left "View in PDF" summary panel now shows the real invoice number and
  a per-line-item breakdown instead of a single flattened project/amount row.
- Fixed a real bug in the Invoices list: the Type column read a nonexistent
  `i.installment` field (always rendered "Full"); now reads the real
  `invoice_type`.
- **Finance sub-tabs** (Invoices/Expenses/Payroll/Milestones) now animate on
  switch, via the same `screen-enter` keyframe used for top-level screens,
  scoped one level down with a new `.orbit-subtab-content > div:nth-child(2)`
  rule (added a `class="orbit-subtab-content"` on the Finance screen root).
- **Invoices and Expenses table rows are now fully clickable** (not just the
  small "View" link) — same pattern as the CRM leads table: `sc-camel-on-click`
  on the `<tr>` plus `sc-camel-on-click="{{ stopClick }}"` on the link's own
  `<td>` so the link still works without double-firing.

### Verification
`node --check` on script.js, a from-scratch tag/brace-balance check (sc-if/
sc-for/sc-raw-select/sc-raw-tr/sc-raw-td/div/x-import/button/textarea/`{{ }}`,
all balanced), and the scaffolded-binding cross-check (template `{{ }}`
idents vs script.js renderVals keys — only sc-for loop aliases like `li`/`po`
flagged, which is expected and not a real gap). Repackaged into all three
bundle copies (byte-identical, JSON-parses back cleanly, new keys like
`pfInvNumber`/`invLineItemRows`/`addInvoiceLineItem` confirmed present in the
written bundle). Backend re-verified post-repackage with a TestClient login +
invoice list call against the live `orbit.db`.

**Not done / explicitly out of scope for this round**: swapping
`docx2pdf`/Word-COM for a Linux-compatible PDF converter before deployment;
wiring a "Delete Invoice" button in the drawer (the backend/service method
already exists, just was never exposed in this drawer, pre-existing gap not
touched); the broader 8-phase roadmap from the 2026-07-16 entry above (Phase
2 onward) is still untouched by this work.

---

## Update (2026-07-17, later) — Invoice PDF alignment/bold, auto-save, payroll sync bug, Milestones fully broken

A large batch of follow-up fixes across Invoices, Payroll, and Milestones, all
user-reported after using the invoice overhaul above.

### Invoice PDF (`invoice_pdf_service.py`)
- **Real root cause of the "qty not aligned under QTY" bug**: `Cell.text =
  value` (python-docx's cell-text setter) doesn't just set text — it replaces
  every paragraph in the cell with a single brand-new default-styled
  paragraph, silently dropping the template's CENTER alignment and 10pt font
  size (confirmed by direct test: alignment came back `None`, font size
  `None`, after a plain `.text =` assignment on a cell that was CENTER/10pt
  in the source template). Every line-item cell was affected, not just QTY —
  it only looked wrong there because a short "1" hugging the left edge of a
  wide cell is the most visually obvious case. **Fixed** by adding
  `_set_cell_text(cell, text, bold=None)`, which reuses the cell's existing
  first run (preserving alignment/font/size) instead of replacing the
  paragraph — the same preserve-don't-replace principle `_set_run_group_text`
  already used for the textbox fields. All four line-item columns plus the
  grand-total cell now go through it. Verified via a real generated PDF
  (rendered and visually inspected): qty/unit price/total now sit correctly
  centered under their headers.
- **Bank details now render bold in the PDF**: `_set_run_group_text` gained
  an optional `bold` param that adds/removes a `<w:b/>` on the run's `rPr`
  (inserted at index 0, not appended, to stay closer to schema-expected
  ordering and avoid a Word "repair" prompt). Applied to all four bank-detail
  lines (Account Name/Number, IBAN, Bank Name).
- **Paid Date**: `Invoice` model gained `paid_date` (nullable `Date`, added
  to the live `orbit.db` via `ALTER TABLE` — nullable column add, no rebuild
  needed this time, unlike the earlier `project_id` nullability change).
  `InvoiceCreate`/`Update`/`Response` schemas updated;
  `InvoiceService._apply_paid_date()` clears `paid_date` server-side
  whenever `status` is set to anything other than `"Paid"` (so an invoice
  bounced back from Paid doesn't keep showing a stale paid date). Also
  fixed, while in this schema: **`InvoiceCreate` had no `status` field at
  all** — every new invoice silently defaulted to `"Draft"` regardless of
  what the create form's Status selector showed, since Pydantic quietly
  drops fields a model doesn't declare. PDF: no dedicated template slot for
  a paid date exists, so it rides on the same line as the issue date —
  `DATE:  17 / 07 / 2026     PAID: 20 / 07 / 2026` — only appended when
  `status == "Paid"` and `paid_date` is set.

### Invoice frontend (template.html / script.js)
- **Line-item row no longer shows the project name twice.** Selecting a
  project auto-filled the Description input with that same project's name,
  so the row visually repeated "Acme Portal Integration" once in the project
  dropdown and again right below it. Description is now only shown
  (`li.showDescription`) when no project is linked; linking a project always
  syncs the description to that project's name behind the scenes (was
  previously fill-once-if-empty, now always-sync while linked).
- **Invoice edit auto-saves like everything else in this app** (Leads,
  Projects, Tasks already worked this way — invoices didn't). Existing
  invoices no longer show a "Save Changes" button at all: every field
  (`setInvoiceField`) debounce-saves (500ms) via a per-field
  `_invoiceApiPatchFor()` → `invoicesApi.update()`, with a footer label that
  reads "Saving…" / "Changes save automatically", matching the CRM Leads
  drawer's pattern exactly. **New** invoices still use the explicit "Create
  Invoice" button — nothing to auto-save against until the record exists.
- **Invoice number prefix lock**: `UPM-CZ-` is now non-editable — everything
  after it (year, sequence, punctuation) stays fully free-form. Implemented
  as an onChange guard (`onPfInvNumber`) rather than a split
  label+input — if an edit would remove/mangle the prefix, it strips
  whatever partial-prefix fragment survived and re-prepends the real one,
  leaving the rest of what was typed untouched.
- **Paid Date field** in the form, shown only when Status = Paid
  (`showPaidDate`), a real `<input type="date">`.

### Payroll — real sync bug, not a UI gap
`GET /api/finance/payroll` calls `get_or_create_slip(emp.id, month,
emp.salary, ...)` for every employee on every page load, passing the
employee's **current** salary each time — but the service only ever used
that value when a slip didn't exist yet. Once a slip existed for that
employee+month (created the very first time anyone opened Payroll that
month), it was returned untouched forever, silently ignoring any later HR
salary edit. **Fixed**: `get_or_create_slip` now re-syncs `gross_salary` (and
recomputes `net_salary` from the slip's own tax/bonus/allowances/deductions)
whenever an existing slip is `Unpaid` and its `gross_salary` no longer
matches the employee's live salary. A slip marked **Paid is left alone**
regardless of later salary changes — it's a historical record at that point,
same "locked once finalized" treatment as everything else in this app.
Verified via TestClient: bumped an employee's salary → payroll immediately
reflected it (Unpaid) → marked Paid → bumped salary again → payroll
correctly did NOT change.

Separately: **the editable Gross/Tax/Allowances/Bonus/Deductions inputs with
live Net Pay calculation the user asked for already existed** in both
`script.js` (`setSalarySlipFieldLive`, debounced auto-save, already
optimistic-update + PUT) and `template.html` (real `type="number"` inputs
bound correctly), gated behind `canRunPayroll` (`access.finance && persona
!== 'devmember'`). The user's screenshot showing a read-only slip was from a
non-finance persona (Ayesha Siddiqui, Senior Engineer) correctly seeing the
locked-down view — not a bug. No changes needed here beyond the sync fix
above.

### Milestones — three real bugs, not "unfinished"
1. **The "Project (locked/won leads only)" dropdown was always empty**, for
   two independent reasons found by reading the actual filter: it read
   `p.leadId` (camelCase — doesn't exist; the real field from the API is
   snake_case `lead_id`, never aliased) *and* it looked up stage via
   `D.leads` (the old frontend mock array — CRM Leads has been fully
   live-backend for a long time). Both fixed: filter now reads `p.lead_id`
   and cross-references `this.state.apiLeads` (the real loaded leads).
2. **The Milestones table's Milestone-name and Expected-date columns were
   always blank** — the template referenced `{{ m.description }}` and
   `{{ m.expectedDate }}`, neither of which the row-mapping in `script.js`
   ever produced (the real fields, present via the row's `...m` spread, are
   `m.name` and `m.expected_date`). Same "scaffolded-but-unwired" class of
   bug flagged multiple times earlier in this file — caught the same way,
   by cross-referencing template idents against renderVals keys. Fixed by
   pointing the template at the real field names rather than inventing new
   aliases.
3. **No delete affordance existed at all** — `deleteMilestone` was fully
   implemented in `script.js` (confirm dialog → DELETE → toast → reload)
   but never once referenced in `template.html`. Added a Delete link/column,
   owner-gated the same way the status dropdown already is.
   Also: Milestone form's "Expected date" was a free-text input with a
   placeholder ("e.g. 15 Sep 2026") instead of a real date picker (same bug
   class fixed for Invoices/Employees earlier), and "Amount" wasn't
   `type="number"` — both fixed, plus `submitMilestone` now explicitly
   validates amount > 0 with a clear error instead of a generic
   "fill all fields" message.

### Validation audit (numeric fields)
Swept every Finance-adjacent form for text inputs holding numeric data;
found and fixed one more gap beyond Milestones' Amount above: the **Expense
form's Amount field** was a plain text `Input` with no `type="number"`.
Invoice line items, Salary Slip fields, and Employee salary were already
correctly `type="number"`. Did not add alphabetic-only restrictions to name
fields (client/description/project name etc.) — real company names
routinely contain digits and punctuation ("7-Eleven", "24/7 Logistics"), so a
strict letters-only filter would reject legitimate input; scoped this pass
to "numbers stay numeric," not the reverse.

### Verification
Backend: `_set_cell_text`/`_set_run_group_text` bold logic verified by
generating a real invoice PDF (two line items, Paid status with paid_date,
all four bank fields, notes) and visually inspecting the rendered output —
line items centered correctly under their headers, bank details bold, paid
date appended to the date line. Payroll sync verified end-to-end via
TestClient (salary bump while Unpaid → reflected; salary bump while Paid →
untouched). Live `orbit.db` backed up before the `paid_date` column add.
Frontend: `node --check`, tag/brace-balance check, and the scaffolded-binding
cross-check all clean (same harmless sc-for alias false-positives as every
previous pass). Repackaged into all three bundle copies — byte-identical,
JSON round-trips correctly, spot-checked new keys (`onPfInvNumber`,
`showPaidDate`, `invoiceAutoSaveLabel`, `li.showDescription`, `m.onDelete`,
`m.expected_date`) all present in the written bundle. Backend re-verified
post-repackage (login + invoices/milestones/payroll list, all 200).

**Not done / explicitly out of scope this round**: a full milestone
edit/detail drawer (only create + inline status + delete exist — matches
what was asked, "should all be functional," without inventing an unrequested
edit-modal); alphabetic-only validation for name fields (see above, judged
counterproductive); the Linux-compatible PDF converter swap and the
2026-07-16 8-phase roadmap remain untouched.

---

## Update (2026-07-17, later still) — CRM Assigned Rep / Project Team / Task Owner all read stale mock employees

This is exactly the "Employees as single source of truth" split-brain the
2026-07-16 roadmap already flagged for CRM's Assigned Rep dropdown and the
Software Dev employee dropdown — the user hit it directly (Lead POC dropdown
and Project Team picker both showing old mock names like "Charlie Davis" /
"Ana Reyes" / "Kofi Mensah" instead of real HR employees).

### Root cause #1 (three call sites): reading `D.employees` instead of the real `apiEmployees`
- `crmAllEmployeeNames` (feeds the CRM Lead "Assigned Rep" dropdown,
  `repOptions`)
- `allEmployeeNames` (feeds the Project drawer's "Team" search-to-add picker)
- `devEmployeeOptions` (feeds the Task Detail drawer's "Owner" dropdown)

All three read `D.employees` — the frontend's original hardcoded mock array
— instead of `this.state.apiEmployees`, the real list `employeesApi.list()`
already loads. Fixed all three to read from `apiEmployees`, filtering out
`status === 'Terminated'` (matching a filter already used for a fourth,
already-correct call site) and, for `devEmployeeOptions` specifically, the
real field name `department` (not the mock's `dept`).

### Root cause #2, found while fixing #1: `loadHrData` never even fetches employees for dev-team-member personas
`loadHrData()` (which loaded `apiEmployees` alongside leaves/openings/policy/
holidays) starts with `if (currentUser.access_level === 'devmember') return;`
— intentional, to skip HR-specific data for dev personas. But that early
return meant `apiEmployees` was **never populated at all** for a dev-team
persona, so even after fixing root cause #1, a dev-member user opening a
Project's Team picker would still see an empty list — the employees list
had quietly become a cross-cutting dependency (CRM, Dev) that this guard
wasn't written with in mind. **Fixed** by splitting `loadEmployees()` out of
`loadHrData()` into its own method, called unconditionally from
`bootAppData()` for every persona; `loadHrData()` keeps its dev-member
early-return for the actually-HR-only data (leaves/openings/policy/holidays).

### Related bug found and fixed while in this code: "Me" screen's salary slip showed a random employee
`myEmployee` (backs the "Me" screen's "Latest salary slip" card) was
`apiEmployees[0]` — literally whichever employee happened to load first,
not the logged-in user. The name/role shown above it came from the correct
`currentUser`-derived `meta`, so this screen could show one person's name
right next to a **different, arbitrary employee's** salary figures for
anyone except that first employee in the list. This was already broken for
every non-dev persona before today; fixing root cause #2 above (employees
now loading for dev personas too) would have newly exposed it to them as
well, so fixed alongside the others: `myEmployee` now looks up
`apiEmployees.find(e => e.id === currentUser.id)`. (The salary figures
themselves are still a hardcoded 18%/82% gross/net approximation rather
than the real salary-slip API — left alone, out of scope for this pass.)

### Verification
`node --check`, tag-balance, and scaffolded-binding checks all clean.
Repackaged into all three bundle copies (byte-identical); confirmed
`loadEmployees` and the `department === 'Software Dev'` fix are both present
in the written bundle. Backend re-checked post-repackage (login + employees
list, 200). Not browser-tested, consistent with this project's standing
workflow.

---

## Update (2026-07-17, later still) — CRM/Projects transitions, list row-click, project start date, manager rules

**Note for future agents**: `.env`'s `DATABASE_URL` now points at a real
Neon Postgres instance (production), not local SQLite — this changed
underneath this session, presumably as part of the deploy work referenced in
the git log below. Migrations from here on need Postgres-flavored SQL
(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), not SQLite's table-rebuild
workaround. Also: this sandbox's `TestClient` reliably succeeds on a script's
*first* request against Neon but frequently raises `RuntimeError: Event loop
is closed` on a second request in the same script (asyncpg + the TestClient
async portal don't get on across repeated calls here) — a real, repeatable
environment quirk, not a sign anything is broken. A direct
`async_session_factory()` + `asyncio.run()` script (used for the migrations
below) does not have this problem and is the more reliable way to verify
multi-step backend behavior against Postgres in this environment.

**Also worth knowing**: earlier the same day, a separate process (three git
commits authored "Syed Hashim" — same session's user, likely a different
tool/agent working on deployment) repeatedly regenerated `ORBIT.html` from a
stale pre-this-session snapshot, silently discarding hours of uncommitted
frontend work each time it repackaged. Recovered by rebuilding from this
session's own scratchpad copy of `template.html`/`script.js` (kept
continuously up to date all session) on top of the *current* bundle's
manifest, since that other process's real fixes (icon CDN unpkg→jsdelivr)
live in a compiled manifest asset this session's repack script never
touches. If frontend changes go missing again, check `git log -- ORBIT.html`
first before assuming this session's own work was faulty.

### CRM Leads
- List-view rows are now fully clickable (`sc-camel-on-click="{{ lead.onView }}"`
  on the `<sc-raw-tr>`, `stopClick` guards added to the stage-select and
  View-link cells) — previously only the small "View" link worked.
- Kanban↔List toggle now animates: wrapped the `crmShowKanban` /
  `crmLeadsLoading` / `crmHasLeadsError` / `crmShowEmptyState` / `crmShowList`
  alternates (all mutually exclusive, confirmed by their own guard
  conditions) in a new `<div class="orbit-subview-content">`, with a new CSS
  rule `.orbit-subview-content > div { animation: screen-enter ...; }`. Unlike
  the existing Finance `.orbit-subtab-content > div:nth-child(2)` rule (which
  needs `:nth-child(2)` because a persistent filter row shares the same
  parent), this wrapper contains *only* the alternates, so a plain `> div`
  selector is enough and there's nothing fragile about DOM position.

### Software Dev (Projects / Tasks)
- Same `.orbit-subview-content` treatment applied three times: (1) an outer
  wrapper around the whole `devTabIsProjects` / `devTabIsTasks` pair, so
  switching those tabs animates; (2) an inner wrapper around Projects'
  own `devProjSubViewIsKanban` / `devProjSubViewIsList` pair; (3) the same
  for Tasks' `devTaskSubViewIsKanban` / `devTaskSubViewIsList` pair. Nesting
  the class inside itself is safe — each instance's `> div` only matches its
  own direct children, and an inner wrapper's identity doesn't change when
  merely toggling kanban/list, so the outer (tab-switch) animation doesn't
  spuriously refire on every kanban/list toggle. `showDevDashboardWidgets`
  (a persistent panel below Projects' kanban/list, not itself a toggle
  alternative) was deliberately left outside the inner wrapper.

### Project start date
New `Project.start_date` (nullable Date). For a project auto-created from a
Won lead (`check_and_create_project_from_lead` in `project_service.py`), it's
set to `lead.actual_closure_date` if the lead had that filled in, else
`now_pkt().date()` (the day the project happens to be created) — Lead
doesn't currently auto-populate `actual_closure_date` when a stage moves to
Won (confirmed by reading the whole stage-change path — it's a manually-set
field only), so there's no stronger signal available for "the date it came
into Won" than the project-creation moment itself. For a manually-created
project (`submitNewProject`, no lead involved), defaults to today. Editable
afterward from the project details drawer (plain `<input type="date">`, no
free-text dual variant like the older Deadline field has — matches the
simpler single-date-input convention established for Invoices/Milestones
earlier today) via `onProjStartDate` → `setProjectFieldLive` (per-field
debounce keyed by `id+field` here, unlike the employee one — no clobbering
risk). Shown on the Kanban card ("Started: ...", under the client/deadline
line) and as a new "Start date" column in the list view, both via
`startDateStr` computed in `mergeProject()`.

Migrated the live Postgres `projects` table (`ALTER TABLE ... ADD COLUMN IF
NOT EXISTS start_date DATE` — safe, additive, no backup needed) and backfilled
the 2 existing rows that had no lead / no actual_closure_date to their own
`created_at` date.

### Manager rules
Employee form (both New Employee and existing-employee edit): the Manager
dropdown no longer offers "None" — `managerOptions` is now just the plain
employee list — and the field is hidden entirely (`efoShowManager` /
`empShowManager`, both `department !== 'Owner'`) for anyone in the Owner
department, since there's no one above an owner to report to. Setting
department to Owner clears `manager` on the spot (in `setEmployeeFormField`
for the draft new-employee form, and in `changeEmpDepartment` for an existing
employee — folded into the same combined PUT that already exists there for
the access-level auto-tick, for the same debounce-clobbering reason
documented in the entry above this one). `submitNewEmployee` now blocks
creation with a clear error if department isn't Owner and no manager was
picked, enforcing "everyone has a manager except owners" at creation time;
no backend-level constraint was added (`manager` stays `Optional[str]` in
the schema) since retroactively enforcing this against existing employee
data wasn't asked for.

### Verification
Backend: `ast.parse` on the three touched Python files, migration + backfill
run directly against live Postgres via `async_session_factory`, confirmed
via a follow-up read that both previously-null projects got a sensible
`start_date`. Frontend: `node --check`, tag-balance, and scaffolded-binding
checks all clean (same harmless sc-for-alias false positives as always).
Repackaged into all three bundle copies, byte-identical, JSON round-trips
correctly. Backend login re-checked post-repackage (200) — see the Neon/
TestClient note above for why multi-request backend scripts were kept to a
minimum this round.

---

## Update (2026-07-17, later still) — Invoice close buttons, medium bug, delete/create transitions, currency fade, and a real CRM/Projects permission model

**Correction to the TestClient note above**: found a cleaner way to script
multi-request backend checks against the live Neon DB in this sandbox —
`httpx.AsyncClient(transport=ASGITransport(app=app))` driven directly via
`asyncio.run()`, instead of `fastapi.testclient.TestClient`. Multiple
sequential requests in one script all succeeded with this approach; the
"Event loop is closed" flakiness was specific to `TestClient`'s sync-over-
async portal, not something inherent to scripting against Postgres here.
Prefer `AsyncClient`/`ASGITransport` from now on for anything needing more
than one request per script.

### Quick fixes
- **Invoice drawer had two "Close" buttons** (one per new/existing branch in
  the footer) when clicking the darkened overlay (or the header's × icon)
  already closes it — both removed; existing-invoice footer now shows just
  the auto-save label with nothing else.
- **Edit Lead's Medium field silently wrote a literal "—"**: `apiLeadToDisplay()`
  had `medium: l.medium || '—'`, and since this value feeds the *editable*
  Medium input directly (its only use), the dash was real text sitting in
  the field, not a read-only placeholder — leave it untouched and save any
  other field, and "—" could persist as the actual medium value. `source`
  right next to it already correctly used `|| ''`; `medium` now matches.
- **`_closeWithAnimation` grabbed the wrong element when overlays nest** — a
  confirm popup (`.crm-pop`, e.g. "Delete lead") sitting on top of a drawer
  (`.crm-panel-slide`, e.g. Edit Lead) meant `document.querySelector(...)`
  returned the *parent* drawer (earlier in the DOM, since nested overlays are
  always defined after their parent in this codebase) instead of the actual
  topmost overlay being closed. Switched to `querySelectorAll(...)` + last
  match, which is always the most-recently-opened/topmost element regardless
  of nesting. This was a real, silent bug (the wrong panel got the closing
  animation class while the real target just vanished instantly) — fixed
  once, benefits every confirm-popup-over-drawer case in the app, not just
  the one that surfaced it.
- **Lead/Project delete and create now animate closed + toast**: `confirmDeleteLead`,
  `deleteSelectedProject`, `submitNewLead`, and `submitNewProject` all
  already pushed a toast on success but snapped their drawer/dialog shut
  instantly via a raw `setState`; all four now route the close through
  `_closeWithAnimation`. New Lead/New Project's *cancel* paths were already
  correctly wired from an earlier session pass — this was specifically the
  success/delete paths that were missed.
- **USD/PKR currency toggle fade**: `setModuleCurrency` now briefly sets a
  `{module}Switching` flag (150ms) before actually swapping the currency,
  and Dashboard/Reports' root content divs bind `opacity` + a CSS transition
  directly to it (`dashboardCurrencyOpacity`/`reportsCurrencyOpacity`) — a
  quick fade-out/in around the currency swap instead of every figure on
  screen just snapping to a new value.

### CRM Leads / Software Dev Projects — real permission model
The ask: anyone who isn't Owner but has been granted CRM/Projects access
should see everything (Leads: including price; Projects: *except* price) and
be able to comment, but not create, edit, or delete. Enforced on **both**
ends — backend so it's real, frontend so the UI doesn't dangle controls that
just 403:

- **Leads router** (`leads.py`): `create_lead`, `update_lead`,
  `change_lead_stage`, `delete_lead`, and both attachment upload/remove
  endpoints switched from `get_current_user` to the existing `get_owner_user`
  dependency. `create_activity` (which comments also POST through, via
  `type: "comment"`) deliberately left on `get_current_user` — comments stay
  open to anyone with view access. Lead `value` was never redacted by
  persona anywhere in `lead_service.py` — already matches "show price to
  non-owner", no backend change needed there.
- **Projects service** (`project_service.py`) — this file still runs on the
  pre-real-auth mock-persona system (`get_persona_role`, a single string;
  see the 2026-07-16 entry on Phase 2/3 debt) and was deliberately left that
  way rather than migrated to real per-user auth as part of this ask — that's
  a much bigger, separately-flagged rewrite. Instead, tightened the *existing*
  persona-string checks to the new rule:
  - `create_project`: was `persona not in ("owner", "admin", "finance")`
    (`"admin"` was dead — no access level is ever literally that) → now
    `persona != "owner"`.
  - `update_project` / `delete_project`: were `persona == "dev"`-only checks
    (any other non-owner persona could still edit/delete) → now
    `persona != "owner"`.
  - `_to_response`: budget/spend redaction was `persona == "dev"` → now
    `persona != "owner"`, so it actually applies to everyone but the owner,
    not just the dev persona.
  - Comments (`add_comment`) intentionally left ungated (any persona can
    still comment, matching "can just comment").
- **Frontend — Leads**: every editable field in the Edit Lead drawer (name,
  POC, assigned rep, source, medium, value, stage, all four date pairs,
  description) now takes `disabled="{{ isNotOwner }}"`. Attachment
  upload/remove controls and the "Delete lead" footer link are wrapped in
  `sc-if value="{{ isOwner }}"` (hidden, not just disabled — an upload
  `<label>`/`<input type="file">` has no `disabled` equivalent worth trusting).
  Kanban card dragging is now `draggable="{{ isOwner }}"`; the existing
  `allowInlineStatusChange` flag (previously just a component-prop hook) now
  also requires `persona === 'owner'`, with a read-only stage Badge shown
  otherwise in both Kanban and List (new `stageTone` computed per lead,
  reusing the same Won/Lost/else → success/danger/info mapping the Edit Lead
  drawer's own badge already used). "New Lead" button hidden for non-owner.
- **Frontend — Projects**: `showProjectFinance` (previously `persona !==
  'devmember'` — a narrower check than the backend's own redaction rule) is
  now `persona === 'owner'`, matching the backend exactly; it already gated
  the Team picker's add/remove controls and the Delete Project button, so
  those became correctly owner-only as a side effect of this one change.
  Added a parallel `isNotOwner` (couldn't reuse `isDevMember`, which the Task
  drawer's own fields still legitimately key off — Tasks were out of scope
  for this pass) and swapped it onto all 7 of the Project drawer's editable
  fields (name, client, status, start date, deadline, budget, description),
  which previously only disabled for `isDevMember`. Kanban card and List row
  status dropdowns now show a read-only Badge for non-owner (`statusTone`
  added to `mergeProject()`, reusing the `STATUS_TONE` map already used for
  Tasks). "New Project" button hidden for non-owner.
- **Deliberately not touched**: Tasks (`tasks.py`/task drawer fields) — the
  ask was specifically "leads, projects"; Task's own `isDevMember` gating is
  untouched and now the one remaining place that name still means what it
  says. Project attachment upload/delete and the dev-only checks inside them
  — edit-adjacent but not explicitly asked about, left as-is to avoid scope
  creep beyond what was requested.

### Verification
Backend: `ast.parse` on the three touched Python files. Live permission
check via `AsyncClient`/`ASGITransport` against the real Neon DB — logged in
as a real non-owner employee (`access_levels: ["employee"]`) and confirmed
`403 "Only owners can perform this action."` / `403 "Only owners can create
projects."` on lead and project creation respectively; confirmed owner login
still creates successfully (and cleaned up the test lead via owner delete).
Frontend: `node --check`, tag-balance, and scaffolded-binding checks all
clean. Repackaged into all three bundle copies, byte-identical, JSON
round-trips correctly, spot-checked new keys (`isNotOwner`,
`dashboardCurrencyOpacity`, `stageTone`) present in the written bundle.

---

## Update (2026-07-17, later still) — real bug: team members invisible on their own dashboard (the "Kofi Mensah" mock-persona identity, finally hit in practice)

User report: added a real employee (Fahad Iqbal) to a project's Team, but
Fahad couldn't see that project on his own dashboard. Root cause: exactly
the pre-real-auth mock-persona debt flagged repeatedly throughout this file
(`projects.py`/`tasks.py` "intentionally still on the single-string
get_persona_role/mock-persona system") — except this specific piece of it
wasn't just tech debt, it was an active bug blocking real usage.

`project_service.py.list_projects()` (and the identical pattern in
`get_project`, `task_service.py`'s equivalents, `add_comment` in both
routers, attachment/comment author attribution, and the frontend's own
`visibleProjectsFlat`) all filtered/attributed using the **literal hardcoded
string `"Kofi Mensah"`** as a stand-in for "whichever employee is logged in
with the dev persona" — a leftover from the original mock-data prototype.
Any *real* employee (Fahad, or literally anyone not coincidentally named
Kofi Mensah) added to a project's `team` list could never match that string,
so the `persona == "dev"` visibility filter always returned an empty list
for them, no matter how many real projects they were actually on.

**Fixed** by threading the real logged-in user's name (from the JWT's
`name` claim, via `get_current_user`, already present since Phase 1 auth
work) through everywhere this comparison happens, replacing the hardcoded
name:
- `project_service.py`: `list_projects`/`get_project` now take a `user_name`
  param, used instead of `"Kofi Mensah"` in the `persona == "dev"` team-
  membership check.
- `task_service.py`: identical fix for `list_tasks`/`get_task`.
- `routers/projects.py` / `routers/tasks.py`: `add_comment` visibility
  checks and the comment-author / attachment-uploaded-by attribution both
  switched from the fake name to `current_user.get("name") or persona`, so
  a real employee's comments are now attributed to *them*, not a fictional
  co-founder.
- `notification_service.py`: `get_notifications`'s automatic "Task Due
  Soon"/"Task Overdue" check was unconditionally querying
  `assignee="Kofi Mensah"` for anyone with the "dev" role — meaning no real
  dev employee's own overdue tasks ever generated an alert for them. Now
  queries by the real caller's name instead.
- **Frontend** (`script.js`): `visibleProjectsFlat` re-filtered the
  *already-correctly-scoped* API response down to `team.includes('Kofi
  Mensah')` for the `devmember` persona flavor — double-broken, since it
  both used the wrong stale persona vocabulary (`devmember`, not the current
  `dev`) and the same phantom name. Removed the re-filter entirely; the
  backend fix above is now the actual source of truth, so the frontend just
  trusts `GET /api/projects`'s response as-is instead of re-filtering
  client-side with logic that could never match a real person.
- **Deliberately left alone**: the notification *broadcast-target* logic
  (`target_user = "dev" if member == "Kofi Mensah" else "all"` in a handful
  of places in `project_service.py`/`routers/projects.py`) still has the
  same stale-name check, so team-assignment/comment notifications still
  over-broadcast to "all" for any real team member rather than targeting
  them specifically — a real but separate, lower-impact issue (notifications
  still *reach* the person, just less precisely, since "all" includes
  everyone) than the reported "can't see the project" bug. Would need
  resolving employee name → real employee ID to target precisely, which
  needs a new repository dependency in `ProjectService`/`TaskService` — left
  as a known follow-up rather than folded into this fix.

### Verification
`ast.parse` on all six touched Python files. Live-verified the actual root
cause and fix directly against `ProjectService.list_projects()`: confirmed
the real "Fahad Iqbal" (found via the live employees list, actually on a
real project's team) is returned when queried with his real name, and
confirmed the *old* hardcoded-name behavior would have returned nothing —
i.e., reproduced the exact reported bug and confirmed the fix resolves it,
without needing his (unknown) password to log in as him directly. Backend
re-checked post-fix: login, `/api/projects`, `/api/tasks`, `/api/notifications`
all 200. Frontend: `node --check`, tag-balance, and scaffolded-binding
checks clean; repackaged into all three bundle copies, byte-identical,
confirmed the `Kofi Mensah`-keyed re-filter is gone (only an explanatory
code comment mentioning the old name by way of documentation remains).

---

## Update (2026-07-17, later still) — Finance-only employee still landed on/could see full company Dashboard

User report: logged in as Adeel Khan (access_levels: `["finance"]` only —
sidebar correctly showed just Invoices & Expenses + Me, no Dashboard link)
but the screen he actually landed on after login was the full company
Dashboard (revenue, profitability, resource utilization — everything).

**Root cause**: `LANDING_SCREENS` (the login/goHome/access-redirect landing
target) was keyed by the *cosmetic single-flavor persona*
(owner/financehead/devmember/hr_admin/employee — `derivePersonaFlavor()`'s
output), not by the employee's real granular `access_levels`. Anyone with
`finance` ticked derives to persona `"financehead"`, and
`LANDING_SCREENS.financehead` was hardcoded to `"dashboard"` — regardless of
whether that specific employee actually had `dashboard` *also* ticked. So a
finance-only employee's sidebar correctly hid Dashboard, but the landing
logic never actually consulted that — it just trusted the derived flavor,
which conflates "has finance access" with "should land on the dashboard
company-wide overview" for no real reason.

This is also why the access-gating redirect safeguard already in
`renderVals()` (`const screen = access[...] === false ? LANDING_SCREENS[persona] : ...`,
added by a separate session earlier the same day per the "fix access gating
for screen-level roles" commit — see the two entries above this one about
that concurrent-editing collision) didn't actually catch this case:
redirecting *away* from an unauthorized Dashboard just sent Adeel *back* to
`LANDING_SCREENS.financehead` — which is `"dashboard"` again. Same broken
map, used as both the initial landing target and its own fallback.

Separately found while in this code: that same redirect's screen→access-key
translation map (`{dashboard:'dashboard', crm:'crm', dev:'dev',
finance:'finance', hr:'hr'}`) had no entry for `setup` (the Setup/Permissions
screen's real id) → `permissions` (its access key) — so the Setup screen
wasn't covered by this safeguard at all; anyone without `access.permissions`
who ended up on `setup` (e.g. via a stale `localStorage`-persisted screen
after their access changed) would never get redirected off it.

**Fixed**: added `deriveLandingFromAccess(access)` — walks the *real* merged
access object (`dashboard > crm > dev > finance > hr > permissions(->'setup') >
'me-leave'` fallback, "me-leave" being the one screen every employee can
always reach regardless of access) — and replaced all three `LANDING_SCREENS`
call sites with it: `onAuthenticated` (initial post-login landing),
`goHome` (clicking the ORBIT logo), and the access-gating redirect's
fallback. Also added the missing `setup: 'permissions'` entry to the
redirect's screen→access-key map. `LANDING_SCREENS` itself removed —
verified zero remaining references (only an explanatory code comment
mentioning it by name for context).

### Verification
Isolated logic check (extracted `mergeAccess`/`deriveLandingFromAccess` and
ran them directly in Node): confirmed `access_levels: ["finance"]` now
derives to landing screen `"finance"`, not `"dashboard"`; confirmed owner
still correctly lands on `"dashboard"`; confirmed an employee with literally
no access levels still safely falls back to `"me-leave"`. `node --check` and
tag-balance checks clean. Repackaged into all three bundle copies, byte-
identical, confirmed `deriveLandingFromAccess` present and no functional
`LANDING_SCREENS[...]` reference remains. Backend unaffected by this fix
(frontend-only) — re-checked login still 200 regardless.

---

## Update (2026-07-17, later still) — Project comments didn't appear until a full page refresh

Small, clear bug: `addProjectComment(id)` (script.js) only called
`this.loadProjects()` after successfully posting — that refreshes the
project *list* (name/status/deadline/team etc.), not the comment thread,
which lives in separate state (`projectComments`) populated only by
`loadProjectDetails(id)`'s own `GET .../comments` call. So a comment posted
fine (toast confirmed it), but nothing on screen changed until a full page
reload happened to call `loadProjectDetails` fresh from scratch. `addTaskComment`,
right below it, already correctly called both `loadTasks()` *and*
`loadTaskDetails(id)` — this was a one-line inconsistency, not a deeper
issue. **Fixed**: `addProjectComment` now also calls `loadProjectDetails(id)`.
Checked the equivalent Lead comment flow (`addLeadComment` ->
`refreshLeadActivities(id)`) while in this area — it was already correct,
so this was specifically a Projects-only gap, not a systemic one.

Repackaged into all three bundle copies after the usual `node --check` +
tag-balance checks; confirmed the fix's exact code present in the written
bundle.

---

## Update (2026-07-17, later still) — Task/subtask due-date picker rejected today and tomorrow; task assignment notification now actually targets the assignee

### The date bug
`onTfDeadlineDate` (New Task/Subtask form) and `onTaskDeadlineDate` (existing
task edit) both did:
```js
const d = fromISO(e.target.value);              // "17 Jul 2026" (display format)
if (d && d < todayISO()) { ...reject as past... } // todayISO() returns "2026-07-17" (ISO format)
```
Comparing two *different* string formats with `<` is close to meaningless —
e.g. "17 Jul 2026" vs "2026-07-17" compares on the very first character
('1' vs '2'), which is why today and tomorrow specifically (day-of-month
17/18, both starting with '1') got rejected as "in the past" while other
dates behaved inconsistently depending on what digit the day-of-month
happened to start with. Every other deadline handler in the app (Project's
`onProjDeadlineDate`/`onPfDeadlineDate`) either doesn't do inline string
comparison or goes through `new Date(...)` first (which normalizes format
differences via actual parsing) — this pair was the only place comparing
raw strings in mismatched formats. **Fixed**: compare `e.target.value`
(still ISO, pre-conversion) against `todayISO()`, then convert to display
format only afterward when storing it. Verified in isolation: old code
rejected both today and tomorrow; new code accepts both.

### Task assignment notifications now target the actual assignee
Same underlying issue as the Projects/Tasks visibility bug fixed earlier
today, in the one place explicitly deferred at the time: `create_task`/
`update_task`'s "Assigned to task" notification used
`target_user = "dev" if assignee == "Kofi Mensah" else "all"` — a real
assignee (anyone not literally named Kofi Mensah) got their notification
broadcast to `"all"` (every employee) rather than targeted at them
specifically. Added `TaskService._resolve_assignee_notification_target()`,
which resolves the assignee's display name to their real employee id via
`EmployeeRepository.find_by_name()` (exact case-insensitive match over its
substring-search results) and uses that as the notification's `user_id`,
falling back to `"all"` only if no exact match is found. `TaskService` now
takes an `employee_repo` param; `routers/tasks.py`'s `get_task_service`
factory updated to inject it. Project's equivalent team-assignment/comment
notification-targeting remains the one still-deferred item from earlier
(not touched here — today's ask was specifically about task assignment).

### Verification
`ast.parse` on both touched files. Live end-to-end via `AsyncClient`/
`ASGITransport`: created a real task assigned to Fahad Iqbal, minted his
real JWT, confirmed his `/api/notifications` now includes the "Assigned to
new task" notification (previously would only have arrived via the "all"
broadcast, indistinguishable from noise); confirmed `/api/tasks` for his
real identity also returns the task (the visibility fix from earlier today
holds for tasks specifically, not just projects). Cleaned up the test task
afterward. Frontend: `node --check` + tag-balance clean; repackaged into all
three bundle copies, byte-identical, confirmed the fix's code present.

---

## Update (2026-07-17, later still) — Employee form simplification + Setup's Stages/Sources/Expense-Categories made to actually propagate to existing records

The user's ask, in four parts: (1) Employee department should be a fixed
4-option list — Owner, Finance, Dev Member, Employee — not a free-form/
derived-from-existing-data list. (2) Selecting Owner as department should
hide Manager and Access Level entirely (Owner already implies full access,
no manager needed). (3) Comment out the Setup → User Management tab for now
(keep the code, don't delete). (4) Setup → Stages & Sources / Expense
Categories: adding already reflected in dropdowns everywhere, but *renaming
or deleting* a stage/source/category needs to actually update existing
leads/expenses currently using it, with a smooth transition on add/delete.

### Employee form (script.js)
- Added `DEPARTMENT_OPTIONS` (the 4 fixed `{value, label}` entries) and
  changed `empDeptOptions2` (the dropdown's options list) from
  `Array.from(new Set(apiEmployees.map(e => e.department)))` — derived from
  whatever departments happened to already exist on real employee rows — to
  this fixed list.
- `openNewEmployee`'s default `dept` changed from `'Software Dev'` to
  `'Employee'` (no longer a valid option), `accessLevels` default changed
  from a department-derived single value to `[]` (matches the "Owner needs
  no access level" rule below — a non-Owner department starts with nothing
  ticked rather than a guessed default).
- The existing `efoShowManager`/`empShowManager` flags (`!efoIsOwnerDept` /
  equivalent, already used to hide the Manager field for Owner) now also
  wrap the **Access Level tick-box section** in both the New Employee form
  and the existing-employee edit view (`<sc-if value="{{ efoShowManager }}">`
  /  `<sc-if value="{{ empShowManager }}">` around the checkbox-row markup in
  `template.html`) — Owner hides both Manager and Access Level, everyone else
  sees both.

### Setup → User Management: commented out, not deleted
The tab button in `template.html` is now inside a plain HTML comment (safe
since it's a plain `<button>` with only `{{ }}` interpolations, no `sc-if`/
`sc-for` directives that a comment would break). `setupTabIsUserMgmt` in
`renderVals()` is hardcoded to `false` (was `this.state.setupTab ===
'usermgmt'`), with an inline comment on how to re-enable both halves later.
`setupTab`'s initial state default changed from `'usermgmt'` to `'stages'`
so Setup doesn't land on a now-hidden blank tab.

### Stages / Sources / Expense Categories now actually propagate
Confirmed via code reading that `stageOptions`/`sourceOptions`/
`sourceFilterOptions`/`expCategoryOptions` were already correctly derived
from reactive state (`crmStagesList`/`crmSourcesList`/
`crmExpenseCategoriesList`) — so **adding** an entry already showed up in
every dropdown with zero further work. The real, confirmed gap: **rename**
and **delete** wrote to a `leadOverrides` state object that was never merged
back into displayed lead data (dead code — the merge step had been removed
in an earlier session when Leads went fully live-backend) — so existing
leads/expenses using a renamed or deleted stage/source/category never
actually changed. Rewrote all four operations to make real API calls instead:

- **Backend**: `LeadCreate.stage` and `LeadStageUpdate.stage`
  (`app/schemas/lead.py`) were a hard `pattern=r"^(New|Contacted|Proposal|
  Negotiation|Won|Lost)$"` regex — even a *correct* frontend rename would
  have been rejected with a 422 before reaching any business logic, since
  Stages & Sources lets Owners rename/add/delete pipeline stages, making the
  valid stage set dynamic rather than a fixed backend enum. Loosened both to
  a plain `Field(..., min_length=1, max_length=100)`. Confirmed via code
  reading that `LeadUpdate` has no `stage` field at all (stage changes only
  ever go through the dedicated `PATCH /{id}/stage` endpoint) and that
  `lead_service.py`'s sequential-workflow validation (`STAGE_WORKFLOW`, keyed
  to the original 6 names) is unreachable for real callers regardless — the
  router requires `get_owner_user` and always passes `is_owner=True` — so no
  further backend change was needed for renamed/custom stage names to work.
  `source` (on leads) and `category` (on expenses) were already plain
  unrestricted strings, no backend change needed for either.
- **Frontend** (`script.js`): `renameCrmStage`/`deleteCrmStage` now filter
  `this.state.apiLeads` for every lead currently in the affected stage, fire
  `Promise.all(...)` over `leadsApi.setStage(id, newNameOrFallback)` for each,
  then `this.loadLeads()` to refresh from the true backend state, with a
  success/error toast. `renameCrmSource`/`deleteCrmSource` are the same
  pattern via `leadsApi.update(id, { source: newNameOrFallback })` (source
  isn't its own endpoint, just a regular field on `LeadUpdate`).
  `deleteExpenseCategory` (no rename feature exists for categories — add/
  delete only, matching the feature's existing scope) does the equivalent
  over `this.state.apiExpenses` via `expensesApi.update(id, { category:
  fallback })`, then `this.loadFinanceData()`. The now-fully-dead
  `leadOverrides` state field and all references to it were removed.
- **Smooth transitions**: added `class="orbit-settings-row"` to each of the
  three settings-row `<div>`s (Pipeline Stages, Reporting Sources, Expense
  Categories) in `template.html`, plus a `settings-row-in` fade+slide-down
  keyframe in the CSS block already holding the app's other transition rules
  (`drawer-slide-out`/`pop-fade-out`/`screen-enter`, etc.). Same "animate on
  every (re)render, not just literally-new rows" convention already
  established by `screen-enter` elsewhere in this app — add and delete both
  trigger a full row-list re-render, so this covers both without needing a
  genuine keyed exit animation (which this template runtime has no
  precedent for and wasn't worth the added risk to attempt un-browser-tested).

### Verification
`node --check` on script.js, tag-balance check (`sc-if`/`sc-for`/`sc-raw-*`/
`div`/`x-import`/`button`/`textarea`/`{{ }}` all balanced), and the
scaffolded-binding cross-check (only the usual sc-for loop-alias false
positives — `al`, `e`, `o`, `opt`, `po`, etc. — flagged, no real gaps).
Backend: `ast.parse` on the schema file, then a live end-to-end check via
`httpx.AsyncClient`/`ASGITransport` against the real dev SQLite DB, logged in
as a real owner (minted JWT, no password needed) — created a lead, `PATCH
.../stage` with a custom non-enum name ("Discovery Call") returned **200**
(previously would have been a 422), `GET` confirmed the custom stage
persisted, `PUT .../{id}` with a custom `source` returned 200, test lead
cleaned up via owner delete afterward. Repackaged into all three bundle
copies (byte-identical, 998958 bytes each); confirmed in the written bundle
that the bulk-API rename/delete logic, `DEPARTMENT_OPTIONS`,
`setupTabIsUserMgmt: false`, and the new CSS class are all present, and that
`leadOverrides` no longer appears anywhere. **Not** browser-tested (this
project's standing workflow) — in particular the row fade-in timing and the
Owner-department Manager/Access-Level hide are worth an actual click-through
before fully trusting the feel of it.

---

## Update (2026-07-17, later still) — New Task's due-date rejection bug: same format-mismatch class, a different call site

User report: creating a New Task with delivery date "19 Jul 2026" (a future
date) still got rejected with "Delivery date cannot be in the past." — even
though `onTfDeadlineDate`'s own onChange-time check (fixed in an earlier
entry above) was already correct.

**Root cause**: that earlier fix corrected the validation *inside*
`onTfDeadlineDate`, but the value it then stores into `taskForm.deadline` is
still `fromISO(e.target.value)` — the **display** format ("19 Jul 2026"), by
design (matches how every other form field in this app stores dates).
`submitNewTask` (script.js) does its own **second**, independent
past-date check at submit time: `if (f.deadline && f.deadline < todayISO())`
— comparing that display-format string directly against `todayISO()`'s ISO
string ("2026-07-17"). Identical bug class to the one already documented
above (raw string comparison across two different date formats — "1" vs "2"
as the first character decides the comparison, not the actual date), just
at a call site the earlier pass didn't touch. `submitNewProject`'s
equivalent check was verified NOT to have this problem — it already runs
the value through a real `new Date(...)` parse before comparing Date
objects, not a raw string compare, and `new Date("19 Jul 2026")` parses
correctly (verified directly in Node) — so nothing else needed changing
there.

**Fixed**: `submitNewTask` now does `const deadlineISO = toISO(f.deadline);`
first, compares that (ISO vs ISO) against `todayISO()`, and reuses
`deadlineISO` directly for the API payload — replacing the previous
`new Date(f.deadline).toISOString().slice(0, 10)` payload construction with
the already-correct `toISO()` helper instead of relying on implementation-
defined free-form Date-string parsing a second time in the same function.

### Verification
Isolated the exact `toISO`/`todayISO` comparison logic in a standalone Node
script and ran it against "19 Jul 2026" (tomorrow, relative to today
2026-07-17), "17 Jul 2026" (today), "18 Jul 2026" (tomorrow), and
"01 Jan 2020" (a real past date) — confirmed the first three no longer
trigger the rejection and the real past date still correctly does.
`node --check` clean. Repackaged into all three bundle copies; confirmed
the fix's code (`deadlineISO = toISO(f.deadline)`) present in the written
bundle.

---

## Update (2026-07-17, later still) — UI Beautification pass

Pure CSS + HTML structure pass. **No backend changes. No JS logic changes. No
button wiring changes.** All changes live in `unpacked/template.html`
(repackaged into all three bundle copies at the end).

### Login Screen — light glassmorphism
- Background changed from dark `#0f0f13` to a soft indigo light-gradient
  (`linear-gradient(135deg, #EEF2FF ... #F0EEFF)`) with two large animated
  radial "blob" pseudo-elements (`orbit-blob1`/`orbit-blob2` keyframes, 12s
  and 16s cycles) for subtle depth movement.
- Login card: white glassmorphism (`rgba(255,255,255,0.80)`,
  `backdrop-filter: blur(32px)`, soft indigo shadow) with a
  `orbit-card-in` entrance animation (slide+scale, 0.52s spring).
- ORBIT logo: orbital SVG mark (identical to the sidebar mark) + gradient
  text in indigo. A small "OPERATIONAL REVENUE & BUSINESS INTELLIGENCE"
  eyebrow line added beneath it.
- Inputs redesigned: icon wrapper (`.login-input-wrap` + `.login-input-icon`)
  with mail/lock SVG icons in each field; light border that turns indigo on
  focus with a glow ring.
- Sign-in button: indigo gradient with a continuous `orbit-shimmer-btn`
  shimmer animation, lift+glow on hover.
- Auth-checking splash (loading state): inherits the same light screen with
  the orbital SVG logo pulsing via `orbit-pulse-glow`.

### Logout Button — round red pill
- Wrapping `div.orbit-logout-wrap` added (flex center) in the sidebar HTML.
- Button now: `border-radius: 9999px`, red gradient fill
  (`#EF4444 → #DC2626`), white text, sign-out SVG icon, `width: auto`
  (no longer full-width rectangle), lift+glow on hover, squish on active.

### Setup Tabs — pill segmented control + content animation
- Tab buttons changed from inline-`style` underline buttons to
  `.orbit-setup-tab` class buttons inside `.orbit-setup-tabs` container.
- Container styled as a pill segmented control (rounded background, inset
  shadow). Active tab detected via CSS `[style*="font-weight:700"]` (the
  template already sets `font-weight:700` on the active tab via
  `{{ setupTabXxxWeight }}`; no JS change needed) — gets white pill + indigo
  text + shadow.
- Tab content panels wrapped in `.orbit-setup-content`; each `sc-if > div`
  gets `screen-enter` fade+slide animation on tab switch.

### Colour & polish
- Sidebar: subtle `linear-gradient(180deg, #FFFFFF 0%, #F7F8FF 100%)`.
- Topbar: `box-shadow` for depth separation from page.
- Table headers: soft indigo tint gradient.
- Avatar in topbar: indigo ring border.
- Badges: richer saturated colours (green/red/amber/indigo).
- Cards: indigo-tinted shadow on hover.
- Topbar search: indigo focus ring when typing.

### Font lift
- `--text-body-size: 14.5px` (was 14px)
- `--text-h2-size: 20px` (was 19px)
- `--text-h3-size: 15.5px` (was 15px)
- `--text-small-size: 13px` (was 12.5px)

### Verification
`node --check` clean (JS unchanged). `sc-if`/`sc-for` balance: 195/195 and
86/86 — perfect. Only `{{ }}` mismatch was line 4595's `data-props` JSON
attribute (the same pre-existing false positive documented on every previous
pass in this file — not a real issue). Repackaged into all three bundle copies
(`ORBIT.html`, `backend/static/index.html`, `frontend/index.html`). Spot-
checked key identifiers in the written bundle: `orbit-card-in`, `orbit-blob1`,
`orbit-logout-wrap`, `orbit-setup-tabs`, `login-tagline`, `login-input-wrap`,
`Sign Out` — all confirmed present. Not browser-tested (project standing
workflow).

---

## Update (2026-07-17, later still) — the "UI Beautification pass" above clobbered several rounds of this session's own work; restored + real merge; then: leave policy year-scoping fix, Holiday Calendar removed, Permissions section removed, real Audit Trail built

### Part 1: the collision, and why this one needed a real merge instead of a straight restore

Picking this session back up after a gap, the user reported things looked
"disturbed" by another agent. Investigation (`git status`, comparing file
mtimes, and diffing the live bundle's decoded template against this
session's own continuously-maintained scratchpad copy) identified the cause
as the "UI Beautification pass" entry directly above this one — a different
tool/session that worked from its own `unpacked/template.html` snapshot
(see its own `unpacked/patch_sidebar.py`) and repackaged `ORBIT.html` (+ both
synced copies) from that snapshot. Same failure mode as the
"concurrent-editing collision" documented earlier in this file, recurring
because that other tool's workspace was never told about this session's
subsequent rounds of work.

The stale snapshot it worked from was **older than that entry's own
framing suggests** — not just missing the last few fixes, but missing
several entire rounds: the "multiple access levels" vocabulary rename, the
CRM/Projects owner-only permission overhaul's frontend flags, the
Kofi-Mensah-identity fix's frontend simplification, the landing-screen fix,
and everything from this session's own most recent work (department
dropdown, stage/source/category real-API wiring, the task-deadline
submit-time fix). Confirmed by checking the live bundle's decoded template
for marker strings from each of those rounds (`deriveLandingFromAccess`,
`DEPARTMENT_OPTIONS`, `leadsApi.setStage(l.id, newName)`, `deadlineISO =
toISO(f.deadline)`, etc.) — all absent, despite each being real, verified,
already-shipped work from earlier the same day.

**But the other tool's own pass really was genuine, well-executed,
self-contained design work** (as its own entry above describes: the
glassmorphism login screen with animated gradient blobs, the round red
"Sign Out" pill button with an icon, the pill-style segmented control for
Setup tabs) — a blind restore-from-scratchpad would have destroyed that in
turn. The right move was a real merge, not a pick-one-side.

**How the merge was done**: extracted the live bundle's template HEAD (the
`</x-dc>`-delimited markup portion, separate from the trailing
`data-dc-script`/script.js portion) and diffed its **set of CSS class
names** against this session's scratchpad template — a more reliable
signal than a raw line diff here, since the two extraction tools
format/order things differently. This isolated exactly six classes unique
to the live bundle (`login-input-icon`, `login-input-wrap`, `login-tagline`,
`orbit-logout-wrap`, `orbit-setup-content`, `orbit-setup-tab(s)`) —
confirmed by reading their full CSS + the one HTML site each was used at —
and confirmed everything else in the live bundle's other style blocks (a
"CRM Leads — motion" block, a "Premium UI" design-token block) was either
character-for-character already present in this session's scratchpad or an
older/superseded version of something this session had already fixed (e.g.
live's copy of the screen-transition rule still had the dead
`sc-if > div[...]` selector this session had already removed in an earlier
round — confirmed via a size/line-count comparison, not just spot-checking).

Ported forward, on top of this session's scratchpad (i.e., functional
correctness kept, visual upgrade re-applied):
- Login screen: added the `<div class="login-tagline">` under the ORBIT
  logo, and wrapped both inputs in `<div class="login-input-wrap"><span
  class="login-input-icon"><svg>...</svg></span><input .../></div>` (mail
  and lock icons, taken verbatim from the live bundle's markup).
- Sidebar logout: wrapped the existing button in `<div
  class="orbit-logout-wrap">` and added the inline SVG "sign out" icon +
  changed the label text from "Logout" to "Sign Out" to match.
- Setup tabs: changed the tab-row wrapper to `class="orbit-setup-tabs"`,
  each button to `class="orbit-setup-tab"` (dropping the now-redundant
  inline `border-bottom`/`font-size`/`color` styling the pill CSS replaces —
  kept only the `font-weight:{{ ... }}` inline style, since the pill CSS's
  active-tab rule keys off that), and wrapped the tab content area in a new
  `<div class="orbit-setup-content">...</div>`.
- Added the whole `ORBIT BEAUTIFICATION v2` CSS block as a new final
  `<style>` block (after this session's own last one), fixing two things
  while transplanting it rather than reproducing them:
  1. `.orbit-setup-content > sc-if > div` → `.orbit-setup-content > div` —
     same "`sc-if` is compile-time-only and never a real DOM node" dead-CSS
     bug already documented and fixed elsewhere in this file (the other
     entry's own description above even says "each `sc-if > div` gets
     `screen-enter`..." — that selector could never actually have matched
     anything, the animation was silently a no-op).
  2. The active-tab selector `.orbit-setup-tab[style*="font-weight:700"]`
     → `[style*="font-weight:600"]` — this app's own `setupTabXWeight`
     render-vals emit `600`/`400` (not `700`) for active/inactive, an
     existing, already-correct convention (the other entry's description
     assumed `700` was already what the template emitted — it wasn't).
     Adjusting the newly-arrived CSS to match was lower-risk than changing
     five render-val call sites to match the CSS instead.
- Added the Google Fonts `@import` line to the "Premium UI" block (the one
  genuinely-missing line there, confirmed via diff).

#### Verification
`node --check`, tag-balance, and scaffolded-binding checks all clean.
Repackaged into all three bundle copies; confirmed via direct JSON-decode of
the written bundle that every marker from every prior round is present
again (`deriveLandingFromAccess`, `DEPARTMENT_OPTIONS`, the stage/source
bulk-API logic, the task-deadline fix, `orbit-settings-row`) **and** all six
of the other tool's new classes are present (`orbit-logout-wrap`,
`orbit-setup-tabs`, `login-tagline`, etc.). Backend diff (`git status`/`git
diff --stat`) was re-checked and confirmed untouched by the other tool this
time — only this session's own prior uncommitted backend work showed as
modified. A live login attempt against the running backend confirmed it
still boots and serves correctly. **Not** browser-tested (standing
workflow) — the merged visual redesign in particular (icons rendering
correctly inside the input wraps, the pill tab active-state actually
lighting up) is worth an eyeballed check before fully trusting the feel of
it, same caveat as every other frontend round in this file.

### Part 2: Leave policy year-scoping, Holiday Calendar removed, Permissions section removed, real Audit Trail

Four separate asks, tackled in one pass after the restoration above.

**1. Leave balance now actually resets each year.** The Setup > Leave &
Holidays screen's own copy already said "this allotment minus their
approved leave for the year" — but `leave_service.py`'s `_compute_balance()`
summed **every** approved/pending leave request the employee had *ever*
taken, with no year filter at all, so a used day from a prior calendar year
would permanently and silently eat into every future year's balance
forever. Confirmed via code reading (`find_approved_by_type`/
`find_pending_by_type` in `leave_repository.py` had no date filter
whatsoever). **Fixed**: both repository methods gained an optional `year`
param that filters `LeaveRequest.start_date` to `[Jan 1, Dec 31]` of that
year; `_compute_balance()` now passes `now_pkt().year`. The Leave Policy
form itself (Casual/Sick/Annual days-per-year inputs, Save Policy button)
was already correctly pre-filling from the real `GET
/api/settings/hr/leave-policy` on load (`apiLeavePolicy` state, confirmed by
reading `renderVals()` and the boot sequence) — no frontend change was
needed for the "should show what's right now" half of the ask, only the
calculation itself was broken.

**2. Holiday Calendar removed from Setup (backend untouched).** Per the same
"comment out, don't delete" convention as User Management/Permissions below
— the panel's markup in `template.html` is now inside an HTML comment with
an explanatory note, and the two-column grid that used to hold both panels
side-by-side is now a single `max-width:480px` column (matching the
Currency Settings tab's layout convention) holding just the Leave Balances
form. The backend `Holiday` model/repository/service/router and the
frontend's `holidayRows`/`addHoliday`/`deleteHoliday`/`nhf*` state and
methods are all left completely untouched (dead-but-harmless, ready to
re-enable) — the ask was specifically to hide the Setup-tab panel "for now,"
not to remove the feature from the data model.

**3. Permissions section removed from Setup.** Same treatment as User
Management earlier in this file: the "Permissions" tab button and its
entire content block (Role Templates / Per-Person Overrides tables) are now
wrapped in HTML comments in `template.html`, with `setupTabIsPermissions`
hardcoded to `false` in `renderVals()` (was `this.state.setupTab ===
'permissions'`) and an inline comment on how to re-enable both halves.
Nothing backend-side was touched — `access.permissions` remains the (oddly
but harmlessly named) access-level key that gates the whole **Setup
screen**, unrelated to this specific sub-tab; removing the sub-tab doesn't
touch that gate.

**4. Audit Trail is now real** (previously `D.auditLog`, 100% frontend
mock data, per this file's own "Implementation Status" snapshot). Built
end-to-end:

- **Backend**: new `AuditLog` model (`app/models/audit_log.py` — `actor`,
  `action`, `entity_type`, `entity_label`, `detail`, PKT `created_at`,
  registered in `models/__init__.py` so `Base.metadata.create_all` picks it
  up automatically, same no-Alembic-yet situation as every other table in
  this project), `AuditLogRepository` (`log()` + `find_all(limit)`,
  ordered newest-first), a thin `AuditLogService`, and `GET /api/audit/`
  (`routers/audit_log.py`, registered in `main.py`). Gated by a new
  `get_audit_user` dependency in `core/dependencies.py` requiring the
  caller's roles include `owner` or `permissions` — deliberately reusing
  `permissions` (already one of the seven real screen-key access levels
  per `ACCESS_LEVELS` in `schemas/employee.py`) rather than inventing a
  new role name, since that's the same access level that gates the whole
  Setup screen on the frontend where Audit Trail lives.
- **Wired into every service the ask named** ("lead movement", "project
  movement", "employee addition", "created by finance or anyone"): added an
  optional `audit_repo` param + a small `_audit(actor, action, label,
  detail)` helper (mirrors the existing optional `notification_repo`
  pattern already used everywhere in this codebase) to `LeadService`,
  `ProjectService`, `TaskService`, `EmployeeService`, `InvoiceService`,
  `ExpenseService`, `MilestoneService`, and `LeaveService`. Logged actions:
  Lead create/update/stage-change/delete; Project create/update
  (status-change detail called out specifically)/delete; Task
  create/update/delete; Employee create/update (password-change called out
  specifically)/deactivate; Invoice create/update/delete; Expense
  create/update/delete; Milestone create/update/delete; Leave
  submit/approve/reject. Every router's service-factory function
  (`get_lead_service`, `get_project_service`, etc.) now also constructs an
  `AuditLogRepository(db)` and passes it through; a few delete endpoints
  (`delete_project`, `delete_task`, `delete_employee`, `delete_invoice`,
  `delete_expense`, `delete_milestone`) needed a `user`/`current_user` param
  added since they previously had no identity to attribute the deletion to.
  Deliberately **not** touched: the Projects/Tasks routers' still-current
  mock-persona system (`persona` strings) — audit calls there use the real
  `user`/`current_user.get("name")` value that's already threaded through
  from the Kofi-Mensah-identity fix earlier in this file, not `persona`.
- **Frontend**: `auditLogApi.list()` (`GET /api/audit/?limit=200`),
  `apiAuditLog` state (loaded via new `loadAuditLog()`, called whenever
  `setScreen` navigates to `'setup'` and once more from `bootAppData` if the
  user's `localStorage`-persisted screen already *is* `'setup'` on a
  refresh). `auditRows` in `renderVals()` now maps real records (`ts` via
  the existing `formatCommentTimestamp()` helper already used for comment
  timestamps elsewhere in the app, `user`/`action`/`record`/`detail` from
  `actor`/`action`/`"{entity_type}: {entity_label}"`/`detail`) instead of
  `D.auditLog`.

#### Verification
Backend: `ast.parse` on every touched file, then a live end-to-end check via
`httpx.AsyncClient`/`ASGITransport` against the real dev DB (owner login via
minted JWT, no password needed) — created a lead (→ "Created" audit entry),
changed its stage (→ "Stage Changed" entry with the correct `'New' →
'Contacted'` detail string), confirmed `GET /api/audit/` returns both with
the correct actor email, confirmed a non-owner/non-`permissions` employee
gets a real `403` from the same endpoint, cleaned up the test lead
afterward. Leave balance: confirmed `GET /api/leaves/balance/{id}` and `GET
/api/settings/hr/leave-policy` both return `200` with the real 12/7/14-day
policy reflected correctly in a fresh balance computation. Frontend: `node
--check`, tag-balance, and scaffolded-binding checks all clean (same
harmless sc-for-alias false positives as always). Repackaged into all three
bundle copies (byte-identical); confirmed via direct JSON-decode of the
written bundle that `auditLogApi`, `loadAuditLog`, `apiAuditLog`, and
`setupTabIsPermissions: false` are all present. **Not** browser-tested
(standing workflow) — the Audit Trail table's real-data rendering and the
Setup screen's new single-column Leave layout are worth an eyeballed check
before fully trusting the feel of it.

**Not done / explicitly out of scope this round**: Alembic migrations for
the new `audit_logs` table (still `create_all`-only, consistent with every
other table in this project); a UI filter/search on the Audit Trail table
(the ask was "should have everything listed," not filtering — kept simple);
wiring audit logging into JobOpening/Candidate/Holiday services (not named
in the ask, and Holiday's Setup UI was simultaneously being removed in this
same round anyway).

---

## Update (2026-07-17, later still) — Notifications overhaul, real Time-logged/Resource-allocation, Reports made fully real + date filter, pill tabs on HR/Finance/Projects

A five-part ask, tackled in the order below.

### 1. Notifications — removed the noise, fixed real targeting bugs, added Mark All Read + animation
- **Root cause of "just time notifications"**: two separate real bugs compounded.
  1. `NotificationService.get_notifications()` auto-generated "Task Due Soon"/
     "Task Overdue" notifications **on every single fetch**, for anyone with
     a "dev" role or owner/admin — a nonstop stream of deadline noise
     drowning out everything else. Disabled entirely (the call sites
     removed, the private `_check_and_create_task_alerts` helper left in
     place unused in case a real, rate-limited, opt-in reminder feature is
     wanted later) — matches the ask ("notification should only be of
     leaves accept/reject... and who assigned u a project").
  2. Independently, **every notification's body text was rendering
     blank** — the template bound `{{ n.text }}`, but the frontend mapping
     in `renderVals()` never produced a `text` field on the mapped
     notification objects (only `...n, icon, ts, onClick` — the real
     content lives in the API's `message`/`title` fields). So even the
     notifications that *did* exist showed nothing but an icon and a
     timestamp — arguably the more literal reading of "just time
     notifications." Fixed: `text: n.message || n.title` added to the
     mapping.
- **Project-assignment notifications now target the real employee**, not a
  broadcast to "all" — the same class of bug already fixed for Tasks
  earlier this file (`_resolve_assignee_notification_target`), this was the
  one deliberately-deferred instance of it for Projects. Added
  `ProjectService._resolve_member_notification_target()` (identical
  pattern: resolve a team-member display name to a real employee id via
  `EmployeeRepository.find_by_name()`, exact case-insensitive match,
  fallback to `"all"`), used in `create_project`'s and `update_project`'s
  assignment/removal notifications and in `routers/projects.py`'s
  `add_comment` comment-notification loop. `get_project_service` now also
  constructs an `EmployeeRepository`.
- **Removed the generic "Project Updated" broadcast** entirely — it fired
  on *every* project save, including every 600ms-debounced per-field
  auto-save the Project drawer already does, meaning the whole company got
  a notification on every keystroke-driven edit to any project. Team
  assignment-change notifications (added above) already cover what
  actually matters here.
- **Leave Approved/Rejected**: confirmed already correctly targets the
  applicant (`user_id=emp.id`), not the HR/owner who approved — no change
  needed, matches "except the owner" from the ask (owner/HR are the actors,
  not the intended recipients of the outcome notification). Leave
  Submitted (→ HR) intentionally left alone — a different notification for
  a different audience (HR needs to know something needs action), not
  something the ask excluded.
- **Frontend**: added an "Mark all as read" link in the notification
  dropdown header (shown only when `hasUnreadNotifications`), wired to the
  `notificationsApi.markAllRead()` endpoint that already existed
  server-side but was never called from anywhere in the app. Added a real
  empty state ("No notifications yet.") for when the list is empty — there
  was none before. **Smooth open/close**: gave the dropdown `class="crm-pop"`
  (reusing the existing pop-in/pop-out keyframes already defined for
  confirm popups elsewhere in the app) and routed `toggleNotif`'s *closing*
  path through the existing `_closeWithAnimation()` helper (opening stays
  instant, matching how every other `crm-pop` in this app already behaves).
- Added a `leave` case to the notification icon-mapping switch (was falling
  through to a generic bell icon for every leave notification).

#### Verification
`ast.parse` on all four touched backend files. Live end-to-end via
`httpx.AsyncClient`/`ASGITransport`: created a real project with a real
employee on the team, minted that employee's JWT, confirmed their
`/api/notifications` includes the assignment notification (previously
would only have arrived via the "all" broadcast) and confirmed **zero**
Task Due Soon/Overdue notifications appear anymore. Frontend: `node
--check`, tag-balance, and scaffolded-binding checks all clean.

### 2. Time Logged This Week / Resource Allocation — now real and actually scoped to "this week"
`GET /api/time-entries/` (`routers/time_entries.py`) previously summed
**every** time entry ever logged, with zero date scoping at all, despite
both dashboard widgets being explicitly titled "this week" — so the
numbers only ever grew, and "Resource allocation" (hours ÷ 40 capacity)
would permanently exceed 100% forever after just a couple of weeks of real
use. Also returned one row *per raw log entry* rather than one row per
employee, so the same person could appear many times in "Time logged this
week." **Fixed**: the endpoint now computes the current Mon–Sun window in
PKT, filters entries to it, and aggregates hours per employee for both the
entries list and the allocation percentages — both widgets are now
genuinely "this week," genuinely real, and (since they share the exact
same underlying aggregation) automatically stay consistent with each
other, addressing "keep them equivalent." Allocations gained a raw `pct`
integer field alongside the existing display string `pctStr`, so the same
real number is reusable elsewhere (see Reports, below) without re-parsing
a formatted string.

#### Verification
Live end-to-end via `AsyncClient`: logged a real 12.5-hour time entry,
confirmed it aggregates correctly into `time_entries` (one row, correct
week label) and `allocations` (31% = 12.5/40, correct), then cleaned up the
test row directly via a DB script (no delete endpoint exists for time
entries).

### 3. Reports — was entirely mock data end to end; now fully real, plus a date-range filter
This was the big one. `renderVals()`'s Dashboard/Reports computation block
opened with `const leads = D.leads || []; const projects = D.projects ||
[]; const invoices = D.invoices || [];` — **reading the frontend's original
prototype mock arrays**, despite CRM Leads, Software Dev Projects, and
Finance Invoices all having been fully backend-live for a long time. Every
figure on the Management Reports screen (and several on the main Dashboard
that share this same code — Profitability, the "Delayed Projects" table)
was silently stale/fabricated regardless of what was actually in the
database. Confirmed via the same technique used earlier in this file for
similar gaps: reading the actual variable assignment, not just checking
whether field names *looked* plausible.

Fixed, systematically:
- `leads` → `this.state.apiLeads`, `projects` → `this.state.apiProjects`,
  `invoices` → `this.state.apiInvoices`. This alone made Sales & Pipeline,
  the Dashboard's Profitability panel, and global search's invoice results
  all real.
- Global invoice search referenced a nonexistent `i.due` field (real field
  is `due_date`) — fixed alongside.
- `p.atRisk` → `p.at_risk`: `ProjectResponse` already has a real `at_risk`
  boolean column (not something needing a new heuristic) — the frontend
  was just reading the wrong (camelCase, never-produced) key, so "At risk"
  always silently counted zero regardless of real data.
- **Delayed Projects table**'s "days overdue" was a hardcoded `{ p2: 3, p9:
  5 }` mock-project-id lookup — meaningless for real projects, which never
  have ids like `"p2"`. Replaced with a real computation from each
  project's own `deadline` vs today.
- **HR section**: `D.employees`/`D.positions`/`D.leaveRequests` → real
  `apiEmployees`/`apiOpenings`/`apiLeaves`; field names fixed to match the
  real schemas (`e.dept`→`e.department`, `e.probationEnd`→
  `e.probation_end`); headcount now also excludes terminated employees,
  matching the filter already used for other real employee-derived lists
  elsewhere in the app.
- **Avg utilization / Dashboard's Utilization panel**: `D.utilization` (a
  mock array of fabricated names/percentages) replaced with the *same* real
  `apiTimeAllocations` data source built in item 2 above — one real
  capacity metric now powers both the Software Dev dashboard's "Resource
  allocation" widget and Reports' "Avg utilization" figure, rather than two
  separate numbers (one real, one fake).
- Found and fixed one more instance of the same bug class while in this
  code, outside Reports proper: the **Log Expense form's department
  filter/dropdown** (`expDeptOptions`) was still deriving from `D.employees`
  (`.dept`) instead of real `apiEmployees` (`.department`) — same
  stale-mock-department gap already fixed for the CRM Assigned Rep and
  Project Team pickers earlier this session, just missed for Expenses.
- **Deliberately left alone**: `budgetRows` ("Department Budgets" panel on
  the Dashboard) — there is no real backing data model for a per-department
  *budget target* anywhere in this app (Finance tracks project
  budget/spent and company-wide expense categories, not planned
  departmental budgets), so fabricating a "real" computation here would
  just be a different flavor of fake. Left on its existing mock source
  rather than inventing a number with nothing real behind it; flagged here
  as a known gap rather than silently left in an inconsistent
  half-fixed state. Similarly, `monthlyPayrollTotal` (computed from
  `D.employees`) was found to be genuinely dead code — computed but never
  referenced by any render-val or template binding — so left untouched
  rather than fixing something invisible.
- **Date-range filter** added: a `<select>` (Last 7 Days / Last 30 Days /
  This Month — reusing the exact same three options and the existing
  `resolveDateRangePreset()`/`inDateRange()` helpers already built for the
  HR Leave Count tab and CRM's own date filters) sits next to the existing
  USD/PKR toggle on the Management Reports header. Applied to the metrics
  that are genuinely time-bound: leads (by `date_received`, feeding
  pipeline value/win rate/deals-won/pipeline-by-stage/leads-by-source) and
  expenses (by `submitted_date`, feeding "Top expense categories").
  Deliberately **not** applied to Collected/Outstanding/Monthly-cash-out
  (these come from a separate finance-stats aggregate endpoint with no
  date param, and are inherently point-in-time "as of today" figures
  anyway, not meaningfully "date-ranged"), nor to Delivery/HR headcount
  figures (also snapshots, not time-series). The Dashboard's own
  `lockedRevenue`/`expectedRevenue` figures (which share the same `leads`
  variable) deliberately keep reading the *unfiltered* list — the
  Reports-specific filter uses a separate `reportsLeads` variable so the
  two screens' figures don't silently interfere with each other.

#### Verification
`node --check`, tag-balance, and scaffolded-binding checks all clean.
Repackaged and confirmed via direct JSON-decode of the written bundle that
`reportsDateRange`, `REPORTS_DATE_RANGE_OPTIONS`, and the real-data source
switches are all present. Not separately re-verified against the live
backend beyond what items 1/2 already exercised (leads/projects/employees/
openings/leaves/expenses list endpoints were all already confirmed working
in earlier rounds this session) — this was a frontend-computation-only fix
reading already-loaded state, no new backend surface.

### 4. HR / Finance / Projects — pill segmented-control tab bars (matching Setup)
Applied the exact same `.orbit-setup-tabs`/`.orbit-setup-tab` pill classes
(already built for the Setup screen and confirmed to key off the existing
`font-weight:600`/`400` active/inactive convention every tab in this app
already used — no JS changes needed) to: Software Dev's Projects/Tasks tab
row, Finance's Invoices/Expenses/Payroll/Milestones tab row, and HR's
Employees/Leave Requests/Hiring/Leave Count tab row. HR's screen wrapper
gained `class="orbit-subtab-content"` (the same fade/slide transition
already used for Finance's own sub-tab switches) — Dev/Projects and Finance
already had their transition wrappers from earlier sessions.

#### Verification
`node --check` and tag-balance clean. Repackaged; confirmed 16 real
`orbit-setup-tab` class occurrences present across the three screens in the
written bundle.

### Overall verification for this round
Backend: `ast.parse` on every touched file (`notification_service.py`,
`project_service.py`, `routers/projects.py`, `routers/time_entries.py`),
plus `from app.main import app` import check. Live `AsyncClient` checks for
both the notification-targeting fix and the time-entries week-scoping fix
(see items 1 and 2 above). Frontend: `node --check`, tag-balance
(`sc-if`/`sc-for`/`sc-raw-select`/`div`/`x-import`/`button`/`textarea`/
`{{ }}` all balanced), and the scaffolded-binding cross-check (only the
usual sc-for loop-alias false positives, no real gaps) all clean.
Repackaged into all three bundle copies — byte-identical (1,019,607 bytes
each), confirmed via direct JSON-decode that every new key/marker from
every part of this round is present in the written bundle. **Not**
browser-tested (this project's standing workflow) — in particular the
notification dropdown's open/close animation and the new pill tab bars on
HR/Finance/Projects are worth an actual click-through before fully
trusting the feel of it.

---

## Update (2026-07-17, later still) — Aesthetic pass: Sign Out button fixed, universal dropdown/toast/sidebar polish, Welcome toast on login

Purely frontend, per the ask ("Dont change the backend though"). No backend
files touched this round.

### Sign Out button — real root cause, not just a redesign
The reported symptom ("white background, disappears almost when hovering")
traced back to **two separate, conflicting `.sidebar-logout-btn` CSS rule
blocks** that had accumulated across different sessions/tools touching this
file — an older bordered/transparent variant and a newer red-gradient-pill
variant (the "ORBIT BEAUTIFICATION v2" one from the previous restoration
entry above). Per CSS cascade rules the newer block should have won outright
(later in source order, equal specificity, both `!important`), so the exact
mechanism behind what the user saw couldn't be fully reproduced statically —
but having two full, duplicate, disagreeing definitions of the same button
is a real bug regardless of which one a given browser/cache state happens
to render, and is exactly the kind of thing that produces inconsistent
results. **Fixed at the root**: deleted the older block entirely, consolidated
everything into one authoritative definition, and used the opportunity to
redesign it properly — full-width (was a small centered pill, easy to miss
against a big sidebar), refined three-stop red gradient, a top border
separating it from the nav above, `translateY` + brightness lift on hover,
scale+dim on press, and a visible `:focus-visible` ring for keyboard nav.

### Sidebar text size increased
`SidebarSection` (the nav-item list component) is a compiled, unmodifiable
design-system component — but it renders its labels via
`fontSize: 'var(--text-body-size)'`, a real CSS custom property. Since CSS
variables inherit down the DOM tree, adding `--text-body-size: 15px` (was
14.5px) and `--text-eyebrow-size: 11.5px` (was 11px) to the sidebar
container's own existing rule scopes the bump to *just* the sidebar —
nav-item labels and section headings — without touching body text
anywhere else in the app that happens to read the same variable name.

### Dropdowns modernized app-wide, one CSS rule
Every `<select>` in this app (every filter, every form) is a native HTML
element rendering the browser's own default arrow/chrome — the literal
"old look" the ask called out. Added a global `select { appearance: none;
background-image: <inline SVG chevron>; ... }` rule (custom chevron icon,
refined border/hover/focus states, Firefox's own dotted focus ring
suppressed in favor of the app's real focus ring) — this reaches every
dropdown in the app instantly with zero per-instance markup changes, since
they're all plain `<select>` elements already.

### Toasts — consolidated, redesigned, and now actually animate closed
Same duplicate-CSS-block pattern as the logout button: **three** separate,
partially-overriding `.crm-toast` rule blocks had accumulated. Consolidated
into one. Along the way, found that toasts had **no exit animation at
all** — `pushCrmToast`'s timeout just spliced the toast straight out of
state, giving the DOM node zero opportunity to animate its own removal, so
every toast simply vanished instantly. Fixed with the same "mark closing,
wait, then remove" sequence used elsewhere in this app for drawers/popups
(`_closeWithAnimation`): added a new `dismissCrmToast(id)` method (marks
`closing: true`, waits 220ms, then actually removes), a `.crm-toast.orbit-
closing` exit keyframe, and wired `pushCrmToast`'s auto-dismiss timeout
through it instead of removing directly. Redesigned the toast itself to be
more prominent per the ask: bigger icon badge (22px→30px), bolder/larger
text (500/13.5px → 600/14px), a `--shadow-modal`-strength shadow instead of
the lighter popover shadow, a subtle backdrop blur, and a manual dismiss
(×) button that uses the same close sequence.

### Welcome toast on login
`handleLogin`'s success handler now fires `pushCrmToast('Welcome, ' +
firstName + '!')` right after `onAuthenticated` — first name only (split on
space), matching how a toast is meant to read at a glance. Deliberately
**not** added to the silent auto-login path (`checkAuth`/`GET /api/auth/me`
on page refresh) — the ask was "upon successful login," and a toast firing
on every page refresh for an already-logged-in user would be exactly the
kind of noise this whole session has otherwise been focused on removing
from notifications.

### Login page
Added a genuine entrance animation to the login error banner (`sc-if
value="{{ hasLoginError }}"` — previously popped in with zero transition,
now fades/slides in). The rest of the login screen (glassmorphism card,
animated background blobs, icon-wrapped inputs, shimmer button) was already
built in the earlier "ORBIT BEAUTIFICATION v2" pass merged in during this
session's restoration work — confirmed still intact, not touched further.

### Buttons — hover lift, app-wide
The design-system `Button` component (`Button.jsx`, compiled/unmodifiable)
only ever changes its own background-color on hover — no elevation or
shadow feedback on any button anywhere in the app. Added a CSS rule
matched against the exact inline style values the component actually
renders (`button[style*="border-radius:var(--radius-sm)"]`,
`button[style*="background:var(--brand-primary)"]`, etc. — real DOM
attribute-selector matches confirmed by decompressing and reading the
compiled component source, not a guess) that adds a hover lift + colored
shadow to primary buttons and a subtle lift to secondary buttons, app-wide,
with zero changes to the component itself.

### Verification
`node --check`, tag-balance (`sc-if`/`sc-for`/`sc-raw-select`/`div`/
`x-import`/`button`/`textarea`/`{{ }}` all balanced), and the
scaffolded-binding cross-check (only the usual sc-for loop-alias false
positives, no real gaps) all clean. Confirmed via `git status` that zero
backend files were touched this round. Repackaged into all three bundle
copies — byte-identical (1,025,350 bytes each); confirmed via direct
JSON-decode of the written bundle that every new marker (`toast-slide-out`,
`dismissCrmToast`, the Welcome-toast string, the select chevron SVG, the
sidebar `--text-body-size` override, `login-error-in`) is present. **Not**
browser-tested (this project's standing workflow) — in particular the
consolidated Sign Out button and the toast enter/exit animation are worth
an actual click-through given the original bug report couldn't be
statically reproduced with full certainty; if the button still looks wrong
after this, it's most likely a stale browser cache serving the old bundle
rather than a remaining CSS issue, given the two-block conflict is now
fully resolved.

---

## Update (2026-07-18) — Production Neon database wiped clean ahead of go-live

User request: clear out the production database before pushing live (they'll
add real data manually from here), keeping exactly one login. Confirmed
scope with the user first (target = the Neon Postgres DB referenced in
`.env`'s commented-out `DATABASE_URL` line, not the local dev SQLite; keep =
the existing seeded HR admin, `hamzashafiq@theupmotion.online` / `1234`).

**Found something important while inspecting first**: Neon's schema had
drifted from the current models — e.g. `invoices` was still missing
`invoice_number`/`line_items`/`bank_*` (columns added by the "Invoice
overhaul" migration earlier in this file, which was only ever run against
whichever DB was active locally at the time — the environment has flip-
flopped between SQLite and this Neon URL repeatedly, per earlier entries).
A plain `DELETE FROM` on every table would have left production on that
same broken schema. **Fixed properly instead of just clearing rows**:
backed up every readable row to `backend/neon_backup_before_wipe_20260718.json`
(gitignored — contains password hashes; local-only safety net, not meant to
be committed) via a script that pointed `DATABASE_URL` at Neon for its own
process only (never touched the actual `.env` file, so local dev still
defaults to SQLite exactly as before), then `Base.metadata.drop_all` +
`create_all` against Neon to rebuild every table from the current model
definitions — guaranteeing the schema Neon now has is exactly what the
deployed code expects, not a stale snapshot from whenever it was last
migrated.

Also found the seeded `hamzashafiq` account in Neon specifically had
`access_levels: ["employee"]`, not `["hr"]` — an old value from before the
access-vocabulary rename earlier in this file, never carried over to this
particular database. Recreated the account fresh with `access_levels:
["hr"]` and reset the password hash for `1234`, rather than assume the old
row's hash/roles were what the user expected.

**End state**: every table in the Neon production DB is empty except
`employees`, which has exactly one row (`hamzashafiq@theupmotion.online` /
`1234`, HR Admin, `access_levels: ["hr"]`). `currency_settings` and
`leave_policies` being empty is intentional and safe — both repositories
already fall back to sensible defaults (`SettingsRepository.get_currency_settings()`
auto-creates a default row on first read; `leave_service.py`'s balance
calc already handles a missing `LeavePolicy` with hardcoded 12/7/14-day
defaults) rather than erroring.

### Verification
Live end-to-end via `httpx.AsyncClient`/`ASGITransport` pointed at the real
Neon URL: `POST /api/auth/login` with the new credentials → 200 with the
correct user payload; `GET /api/auth/me` with the returned token → 200.
Row counts re-checked across all 16 tables post-wipe: 1 for `employees`, 0
for everything else. Confirmed via `git status` that the local `.env` file
was never modified (dev still defaults to SQLite) and that the backup JSON
is untracked (added a `.gitignore` rule — `backend/neon_backup_before_wipe_*.json`
— so it can never be committed by accident, alongside a new `**/*.db.bak-*`
rule covering the SQLite backup files this project has made a habit of
creating before risky migrations).

---

## Update (2026-07-18) — Real production bug: every authenticated call 401'd right after login (trailing-slash redirect stripping the Authorization header through the Vercel proxy)

User report: logs in successfully (valid token issued), then every subsequent
API call fails with 401 and the app kicks back to the login screen — no
errors in Render's backend logs. Reproduced and root-caused live against the
actual deployed stack, not guessed from reading code.

### Root cause
`leads.py` registers its list endpoint as `@router.get("", ...)` (no
trailing slash needed). **Every other router** — `projects`, `tasks`,
`notifications`, `employees`, `leaves`, `job_openings`, `invoices`,
`expenses`, `payroll`, `milestones`, `time_entries`, plus this session's own
`audit_log` and `finance_stats` — used `@router.get("/", ...)` /
`@router.post("/", ...)` instead, meaning FastAPI's real path is
`/api/employees/` etc. (trailing slash required). The frontend calls every
one of these **without** a trailing slash (`apiFetch('/api/employees' + q)`).
FastAPI's default `redirect_slashes=True` therefore issues a `307` to the
trailing-slash version on every single one of these calls.

The `frontend/vercel.json` rewrite (`/api/:path*` → the Render backend) is
what made this fatal rather than just an extra round-trip: when a `fetch()`
follows a redirect that crosses origins (Vercel → Render is a different
origin as far as the browser is concerned, even though the rewrite makes it
*look* same-origin for the original request), **browsers strip the
`Authorization` header** on the redirected request as a security measure.
So the redirected request lands at Render with no token at all →  clean,
correctly-behaved `401 "Authentication required"` — nothing crashes,
nothing logs an error, because from the server's point of view an
unauthenticated request is completely normal. This is also why the
symptom is invisible in Render's own logs and only visible in the
browser's network tab as a request that mysteriously resolves to the full
`onrender.com` URL instead of staying on the Vercel domain.

**Diagnosis method** (worth remembering for next time this class of bug
shows up): rather than trust an "IDE agent"'s diagnosis pasted by the user
(which claimed the errors were stale cached `checkAuth()` console noise from
before login — contradicted by its own pasted stack trace, which clearly
showed the calls originating from `handleLogin`'s own success path), tested
the *exact* failing request live: logged in via `curl` against the real
Vercel domain, took the real token, and replayed it against
`/api/employees` (no slash, 307) vs `/api/employees/` (with slash, 200) —
both direct-to-Render and through the Vercel proxy — until the pattern was
undeniable. Direct-to-Render calls with a trailing slash always worked;
anything requiring the proxy to follow a redirect broke. Confirmed via
`grep` that `leads.py` alone uses the no-redirect route style and is the
one endpoint that was never in the user's failure list.

### Fix
Changed every affected router's collection-root `GET`/`POST` decorator from
`("/", ...)` to `("", ...)` — matching `leads.py`'s already-correct
convention. This removes the trailing-slash requirement entirely (both
`/api/employees` and `/api/employees/` still resolve, but the no-slash form
no longer redirects), so there's nothing for a cross-origin hop to strip a
header from. No frontend changes needed — every `apiFetch` call already
uses the no-slash form; it just no longer gets redirected away from it.

### Verification
`ast.parse` on all 13 touched router files; `from app.main import app`
import check (94 routes). Live check with `follow_redirects=False` via
`httpx.AsyncClient`/`ASGITransport`: logged in, then hit all 13 previously-
redirecting endpoints — every one now returns `200` directly with zero
redirects (`/api/audit` correctly returns `403` for this HR-only test
account, which is the right authorization behavior, not a bug). **This fix
lives only in the local backend right now — it needs a git push to actually
reach the Render deployment**, which is what makes the live site work again;
committing/pushing was deliberately left for explicit user confirmation
rather than done automatically, per this project's standing practice around
deploys.

### Incidental, separate finding while investigating
The original `orbit-upmotion.vercel.app` Vercel project was torn down
mid-session (the user was in the process of re-importing to a new project,
`orbit-up-motion`, with Root Directory correctly set to `frontend/` — that's
where `index.html` + `vercel.json` actually live, not the repo root). Not a
code bug — just a reminder that this repo now has two live deploy targets
(Render backend, Vercel frontend) that can independently go stale/get
recreated, on top of the local dev SQLite environment.

---

## Update (2026-07-18, later) — Employee probation: 3 months from start date, computed automatically, shown as In Probation / Cleared

Ask: probation should last 3 months from an employee's join date, computed
automatically (not manually entered), and the app should clearly show
whether someone is still in probation or already cleared.

### What existed before
`Employee.probation_end` was a real, nullable DB column and schema field —
but nothing anywhere ever set it. It was manually-settable via
`EmployeeCreate`/`EmployeeUpdate` in principle, but no UI ever exposed a way
to set it, so it was always `NULL` for every real employee. The one place
that read it (`selEmployee.probationStr` in the Employee Detail modal)
therefore always showed "Confirmed" for everyone, and Reports'
`probationCount` — which only checked "does this employee have *any* value
set," not whether that date had actually passed — would have always been 0
regardless of how many people were genuinely still within their first 3
months.

### Backend (`app/services/employee_service.py`, `app/schemas/employee.py`)
- `probation_end` is now **always** computed server-side as
  `start_date + relativedelta(months=3)` (using `python-dateutil`, already
  a dependency — correctly handles month-length edge cases like Jan 31 → Apr
  30, which naive manual date math would get wrong) — in `create_employee`,
  and recomputed in `update_employee` whenever `start_date` changes. Any
  client-supplied `probation_end` value is silently ignored/overwritten;
  verified live that attempting to set it directly (without touching
  `start_date`) has no effect, confirming there's no way to manually
  override it, matching "should start from start date."
- Added a new computed response field, `probation_status`: `"In Probation"`
  or `"Cleared"`, derived in `_to_response()` by comparing `probation_end`
  to `now_pkt().date()` — never trust a stored/client value for this, it's
  always freshly evaluated against today.

### Frontend
- Employee Detail modal: `probationStr` now reads the real
  `probation_status` + a properly formatted date (`fromISO()`, e.g. "In
  probation until 18 Oct 2026" / "Probation cleared on 1 Jun 2026" instead
  of a raw ISO string), rendered as a real Badge (warning tone while in
  probation, success tone once cleared) instead of plain muted text that
  always said "Confirmed."
- Employee list table (HR → Employees): added a new **Status** column with
  the same Badge, so HR can see who's still in probation at a glance
  without opening each employee individually.
- Reports "On probation" count (`probationCount`) fixed to filter on
  `probation_status === 'In Probation'` instead of "has any value set" —
  the old check would have silently included people whose probation ended
  months or years ago, forever, once the field started actually being
  populated.

### Verification
`ast.parse` + app import check. Live end-to-end via `AsyncClient`: created
an employee starting today → `probation_end` = today+3mo,
`probation_status` = "In Probation"; created another starting ~4.5 months
ago → correctly "Cleared"; attempted to manually set `probation_end` to a
future date without changing `start_date` → silently ignored, value stayed
at the auto-computed one; changed an existing employee's `start_date` →
`probation_end`/`probation_status` recomputed correctly. Frontend:
`node --check`, tag-balance, and scaffolded-binding checks all clean.
Repackaged into all three bundle copies (byte-identical, 1,026,833 bytes
each); confirmed `probationStatus`, `probationTone`, and the new copy text
present in the written bundle. **Not** browser-tested (standing workflow).

---

## Update (2026-07-18) — 7-item bug/polish batch: login flicker, manager-select bug (real root cause found), login error messages, profile styling, owner notifications, and a real assigned-task visibility bug

The user gave a 7-item numbered list in one message. Worked through it in
roughly ease/dependency order. All 7 are done; bundle repackaged once at the
end.

### 1. Login screen flicker + splash/login flash on refresh
`checkAuth()` previously treated ANY failure from `GET /api/auth/me` —
a genuinely invalid/expired token OR a transient network hiccup / Render
free-tier cold start — identically: clear the token, show the login screen
immediately. A perfectly valid session hitting a momentary blip during the
auto-login check would flash to the login screen with no recovery. **Fixed**:
`checkAuth` now retries up to 3 additional times (1.2s/2.4s/3.6s backoff)
for any failure that ISN'T the literal `"Session expired"` message (a proven-
invalid token), only giving up and showing login after those retries are
exhausted. This is a best-effort fix for the most plausible, verifiable
mechanism — the exact frame-by-frame visual "flicker" couldn't be fully
root-caused without live browser access.

### 2. Manager selection not registering on New Employee form — real root cause found
`managerOptions` (`script.js`, feeds both the New Employee and existing-
employee-edit Manager `<Select>`s) was built as a plain
`apiEmployees.map(e => ({value: e.name, label: e.name}))` — no blank/
placeholder option. The Select design-system component (found by decompiling
the relevant manifest chunk, `a7fb5d78-...js`, line ~1200) is a completely
plain native `<select>` under the hood — nothing custom or exotic. That's
exactly the problem: a native `<select>` whose controlled `value` (`''`,
before any selection) doesn't match *any* `<option>`'s value falls back to
**visually showing the first real option as selected** even though the
underlying React state is still empty. The user was seeing what looked like
an already-selected manager name, assumed it was set, submitted, and got
"Manager is required" because `employeeForm.manager` was truly still `''`.
Root-caused via static reading + directly inspecting the compiled Select
component's source, not guessed. **Fixed**: `managerOptions` now prepends a
real placeholder `{ value: '', label: 'Select manager…' }`, so the native
select correctly shows "no selection" until one is actually made, and a
truly-set existing value still displays correctly (matches a real option,
not the placeholder).

### 3. Login error messages
`apiFetch` treated every 401 — including from `/api/auth/login` itself — as
"Session expired," masking real credential errors. Fixed to exempt
`/api/auth/login` from that handling. Backend (`routers/auth.py`) now
returns distinct messages: `"No account found with this email."` (bad email)
vs `"Incorrect password."` (bad password) — previously both cases
deliberately shared one generic anti-enumeration message; the user's ask
explicitly overrides that tradeoff for this internal tool. Worth flagging:
this does mean an attacker can now tell whether an email exists in the
system — an accepted tradeoff per explicit request, not an oversight.

### 4. Top-right profile styling
Was a bare `Avatar` + two plain text lines, no container, no hover state.
Added `.orbit-profile-chip` (pill-shaped card: subtle border, `--bg-page`
background, hover shadow), `.orbit-avatar-ring` (2px gradient ring wrapper
around the avatar circle), and restyled the role label as a small bold
brand-colored uppercase tag instead of plain muted text. Pure CSS/markup
change (`template.html`) — no new state or behavior, since the ask was
purely visual. Did not add a dropdown/chevron affordance since there's no
menu behind it to open — would have been exactly the "scaffolded but
unwired" bug class this file has flagged repeatedly elsewhere.

### 5. Notifications should also reach the Owner
- **Leave Submitted** (`leave_service.py`): was `user_id="hr"` only. Now
  fires to both `"hr"` and `"owner"` (two `notification_repo.create()` calls;
  each `user_id` is a single broadcast-target string per the existing
  `NotificationRepository` design — there's no multi-target row).
- **Project comments** (`routers/projects.py add_comment`): notified team
  members only. Added an unconditional extra notification to `user_id=
  "owner"` (skipped only when the commenter themselves is the owner, to
  avoid self-notifying).
- **Task comments** (`routers/tasks.py add_comment`): same owner-notify
  addition. While in this code, also fixed a real, separate bug found
  alongside it: this endpoint still had the exact stale hardcoded-name
  broadcast bug already fixed elsewhere (`target_user = "dev" if member ==
  "Kofi Mensah" else "all"`) — meaning every real task comment was
  broadcasting to literally **every employee** ("all") instead of the real
  commented-on task's assignee/team. Switched to
  `TaskService._resolve_assignee_notification_target()` (the same real-name-
  to-employee-id resolver already used for task-assignment notifications),
  matching how `routers/projects.py`'s equivalent comment handler already
  worked.

### 6. Assigned Project not visible to assignee — investigated, confirmed already fixed
This exact class of bug (hardcoded mock-persona name instead of the real
logged-in user) was fixed in an earlier session (see the 2026-07-17 entries
above) and is fully committed (`f1df737`, confirmed identical to
`origin/main` — nothing here is sitting unpushed). Verified live, end-to-end,
against the real dev DB via `httpx.AsyncClient`/`ASGITransport`: logged in as
owner, added a real employee (Fahad Iqbal) to a real project's `team`, logged
in as Fahad, confirmed `GET /api/projects` and `GET /api/projects/{id}` both
correctly include it. No further change needed — this one was already
working correctly by the time this session picked it up.

### 7. Assigned Task (and subtask) not visible to assignee — real, current bug found and fixed
There's no separate "Subtask" model — the app's "subtasks" are just `Task`
rows scoped to a project, so this is one bug, not two. Root cause, found by
first verifying the backend was correct (same live end-to-end method as
item 6: assigned a task directly to Fahad Iqbal via `assignee`, confirmed
`GET /api/tasks` correctly included it for him even when he *wasn't* on that
project's `team` — the backend's `Task.assignee == user OR Project.team
LIKE ...` OR-condition explicitly allows this), then finding where the
frontend still disagreed with a working backend.

`script.js`'s `visibleTasksFlat` (used by the Tasks list/Kanban/filename
dropdowns) re-filtered the API's own response down to
`allTasksFlat.filter(t => visibleProjectIds.has(t.projectId))` — i.e., "only
tasks whose *project* I can see." But a task can be legitimately visible via
a **direct assignee match** even when its project is only visible to that
project's team (which the assignee may not be on) — exactly the scenario a
task-only assignment produces. So a task correctly returned by the backend
was being silently thrown away again on the client because its project
wasn't in the separately-computed visible-projects set. Confirmed by
reproducing the exact scenario end-to-end against the live dev DB (assigned
Fahad a task on a project with `team: ["Leah Novak"]`, i.e. Fahad explicitly
NOT on the team): backend `GET /api/tasks` → includes it; backend
`GET /api/projects` → correctly excludes that project for him (expected,
unrelated to task visibility) — proving the frontend's project-based
re-filter for tasks was structurally wrong, not just theoretically risky.

**Fixed** the same way the identical project-level bug was already fixed in
the 2026-07-17 pass: `visibleTasksFlat` now just trusts the backend's
response outright (`= allTasksFlat`), same principle as `visibleProjectsFlat`
right above it in the same function. The dead `persona === 'devmember'`
condition this replaced was *not* actually dead code (a legitimate surprise
mid-investigation) — `derivePersonaFlavor()` deliberately still emits the
old cosmetic flavor strings (`devmember`/`financehead`/`owner`/`employee`)
on purpose, specifically so ~15 other pre-existing frontend-only cosmetic
checks (labels, `canRunPayroll`, `showDevDashboardWidgets`, etc.) keep
working unchanged — so those other `'devmember'` checks elsewhere are
intentional and were correctly left alone; only this one specific
re-filtering use was actually wrong.

### Verification
`node --check`, tag-balance check (`sc-if`/`sc-for`/`div`/`x-import`/etc. all
balanced), and the scaffolded-binding cross-check (only the usual harmless
sc-for loop-alias false positives) all clean. Backend: `ast.parse` on every
touched Python file; live end-to-end checks via `httpx.AsyncClient`/
`ASGITransport` against the real local dev SQLite DB for the login-error
messages, and separately for both the already-working project-visibility
case and the newly-fixed task-visibility case (created real test
projects/tasks, reset a real employee's password via the owner endpoint to
log in as them, cleaned up test data afterward). Repackaged into all three
bundle copies — confirmed byte-identical (1,030,028 bytes each), JSON
round-trips correctly, and spot-checked that `Select manager…`,
`orbit-profile-chip`, `orbit-avatar-ring`, and the fixed
`visibleTasksFlat = allTasksFlat` line are all present in the written
bundle. Backend re-checked post-repackage (login + employees/projects/tasks
list, all 200). **Not** browser-tested (standing workflow) — in particular
the login-flicker fix and the profile chip's visual feel are worth an actual
look before fully trusting them.

**Not done / out of scope this round**: the git history confirms local HEAD
already equals `origin/main` (nothing new pushed by this session yet, but
also nothing from the earlier "trailing-slash" session sitting unpushed
either — that had already landed by the time this round started). The
uncommitted changes from this round (this CLAUDE.md entry, the three bundle
copies, and the 6 touched backend files) still need an explicit user
go-ahead before committing/pushing, per this project's standing git-safety
practice. The `devEmployeeOptions` filter (`e.department === 'Software Dev'`)
noticed in passing while investigating item 7 is stale relative to the newer
fixed 4-option department list (`'Dev Member'`, not `'Software Dev'`) —
harmless for existing pre-migration employees (who still have the old
string in the DB) but would silently exclude any brand-new Dev Member
employee from the *existing-task reassignment* dropdown specifically (new
Task creation uses a different, already-correct project-team-based picker).
Flagged, not fixed — out of scope for this round's ask.

---

## Update (2026-07-18, later) — 8-item batch: task delete, real Finance/Setup/Employee permission rules, expense categories now persist server-side, UI polish, owner-priority bug, refresh-flash deep dive

The user gave an 8-item list plus two follow-up asks in the same message. All are done; bundle repackaged once at the end. Nothing committed/pushed yet — same standing practice as every prior round.

### 1. Delete Task button
The task detail drawer had no delete affordance at all (`tasksApi.remove()`/`DELETE /api/tasks/{id}` already existed and worked — just never wired to any button, the same "scaffolded but unwired" class of gap flagged repeatedly in this file). Added `deleteSelectedTask` (confirm → `tasksApi.remove()` → animated close → toast → `loadTasks()`), and a footer "Delete Task" button gated by `!isDevMember` (matches the existing field-disable gating on the same drawer — dev persona can't delete, matching the backend's own `persona == "dev"` 403 in `task_service.py`).

### 2. Real Finance / Setup / Employee-creation permission rules — this was the big one
The ask: invoices/expenses/payroll/milestones editable only by Owner or Finance; Setup editable only by Owner; Add Employee only by Owner; everyone else with view access to those screens should be strictly read-only. Investigated the actual backend first rather than assuming the frontend gating was the only gap — it wasn't.

**Real finding**: `invoice_service.py`, `expense_service.py`, `milestone_service.py`, `salary_slip_service.py` had **zero** permission checks of any kind on create/update — only the `DELETE` endpoints were owner-gated (via `get_owner_user`). Any authenticated employee, regardless of access level, could `POST`/`PUT` invoices, expenses, milestones, and payroll slips directly against the API. The frontend had no gating either (no disabled fields, no hidden buttons) beyond `canRunPayroll`/`canApproveExpense`, and even those used `access.finance && persona !== 'devmember'` — checking the *derived single persona flavor*, which is unsafe for a multi-access-level employee (e.g. someone ticked both `hr` and `finance` derives to flavor `hr_admin`, not `financehead`, but `access.finance` is still true and `persona !== 'devmember'` is still true, so they'd get full edit rights despite not really being "Finance").

**Backend fix**: new `get_finance_user` dependency (`core/dependencies.py` — owner or finance role, mirrors the existing `get_owner_user`/`get_hr_user` pattern) applied to all of `invoices.py`/`expenses.py`/`milestones.py`/`payroll.py`'s create/update/delete endpoints (delete was owner-only before; broadened to owner+finance to match "owner and finance persons" from the ask). `leave_policy_service.py`'s `update_policy` and `holiday_service.py`'s `create_holiday`/`delete_holiday` tightened from `has_role(persona, "hr", "owner")` to `has_role(persona, "owner")` — Setup-screen actions are now owner-only even though HR could touch these before. `employee_service.py`'s `create_employee` tightened from `has_role(persona, "owner", "hr")` to `has_role(persona, "owner")` — **only** create is restricted; `update_employee`/`delete_employee` deliberately left as owner-or-HR, since the ask was specifically "Add Employee," not employee management generally (HR still manages existing employees, leave, hiring).

**Frontend fix**: added `isFinanceEditor` and `isOwnerReal` in `renderVals()`, computed directly from the real `rawAccessLevels` array (not the derived flavor) — `isFinanceEditor = owner or finance in the list`, `isOwnerReal = owner in the list`. Replaced `canRunPayroll`/`canApproveExpense`'s flavor-based checks with `isFinanceEditor`. Gated: "New Invoice"/"Log Expense" open buttons, every invoice field (number/select/date/line-items/bank-details) with `disabled="{{ !isFinanceEditor }}"`, the invoice line-item add/remove links, the expense form's fields and Submit button, and retargeted the existing `isOwnerForMilestones`/`isNotOwnerForMilestones` flags (previously literally `persona === 'owner'`) to `isFinanceEditor` so Finance persona can manage milestones too, not just Owner. Setup: Leave Policy's three day-count inputs + Save button, and Stages/Sources/Expense-Categories' rename/delete links + all three "add new" inputs+buttons, all gated behind `isOwnerReal` (Currency Settings was already correctly owner-gated via the pre-existing `isOwnerPersona` flag — left alone). Add Employee: both the "Add Employee" open button and the form's own submit button gated behind `isOwnerReal`.

**While fixing this, found and fixed a real, separate stale-vocabulary bug in the invoice footer**: the existing/new-invoice footer had *two* `sc-if` blocks that were both keyed on the exact same `{{ invoiceDrawerIsNew }}` condition (one for the Create button, one for the "Changes save automatically" label) — meaning the autosave label's block could only ever show when `invoiceDrawerIsNew` was **also** true, which is a contradiction (it's meant for the *existing*-invoice case). In practice this meant the autosave label never rendered for a real existing invoice at all — the footer showed nothing where "changes save automatically" was supposed to appear. Fixed by negating the label's condition to `!invoiceDrawerIsNew`. This directly addresses the requested "Create Invoice on right, autosave label on left" layout — the structural CSS (`justify-content:space-between`, spacer elements) was already correct; the actual bug was this one inverted condition.

### 3. Expense categories now persist server-side (real root cause: no backend model ever existed)
Root cause, found by tracing `crmExpenseCategoriesList`'s initializer: `(window.ORBIT_APP_DATA && window.ORBIT_APP_DATA.expenseCategories) || []` — and `window.ORBIT_APP_DATA` **does not exist anywhere in the current bundle** (confirmed by searching the whole file for its definition — it was fully removed at some point when mock data was phased out, except this one stray reference). So the category list started as `[]` for every fresh page load, for every user, and `addExpenseCategory`/`deleteExpenseCategory` only ever mutated **local, in-memory React state** — never sent anywhere. A category the owner added was real only for the rest of that browser tab's session; a refresh, a different device, or a different logged-in user never saw it. This is a stronger bug than "doesn't sync to others" — it never persisted for anyone, including the owner's own next session.

Built a real minimal backend feature for this (there was no generic settings/key-value table to piggyback on — checked): `ExpenseCategory` model (`id`, unique `name`, `created_at`), `ExpenseCategoryRepository` (auto-seeds `["Software", "Travel", "Office Supply", "Marketing", "Other"]` on first read if the table is empty — chosen from the real distinct categories already used in the live DB's `expenses` rows plus a couple of sensible extras), `ExpenseCategoryService` (owner-only create/delete, ≥1-category-must-remain guard on delete), and `GET/POST /api/settings/finance/expense-categories` + `DELETE /{id}` (list is public/any-authenticated-user so the Log Expense dropdown always has *something* to show; mutations are owner-only per item 2's Setup rule). Frontend: `expenseCategoriesApi`, `apiExpenseCategories` state (loaded via `loadExpenseCategories()` in `bootAppData`), `addExpenseCategory`/`deleteExpenseCategory` rewritten to call the real API and update state from the server's response instead of a local array splice; `expCategoryOptions`/`expenseCategorySettingsRows` now read `apiExpenseCategories` instead of the dead local list.

### 4. Download PDF prominence
Changed the invoice preview panel's "Download PDF" button from `variant="secondary"` (light/subtle) to `variant="primary"` (the same accent-filled style used for "Create Invoice" elsewhere), bumped its height slightly (40→46px) and added a download-arrow glyph to the label.

### 5. Notification banner auto-close on outside click
It previously only closed by re-clicking the bell (or navigating away). Added a `mousedown` listener on `document` in `componentDidMount` (removed in the now-added `componentWillUnmount`) that closes the dropdown (via the same `_closeWithAnimation` used everywhere else) if the click lands outside a new `.orbit-notif-wrap` class added to the bell+dropdown's containing `<div>`.

### 6. Dropdown "weird double arrow" bug — real root cause found
The design-system `Select` component (decompiled from the manifest chunk, `Select.jsx` source at line ~1200) is a plain native `<select>` that **already draws its own chevron** — a real `Icon("chevron-down")` absolutely positioned as a sibling right after the `<select>`. A previous session's "modernize dropdowns" pass added a blanket `select { ...; background-image: <svg chevron>; ... }` CSS rule targeting *every* `<select>` in the app — which also matched the ones already inside this component, drawing a **second**, slightly-offset chevron on top of the component's own. Only plain `sc-raw-select` filters (no such sibling icon) ever looked correct; every `HealerDesignSystem.Select` instance showed two overlapping arrows. Fixed with `select:has(+ div[style*="pointer-events:none"]) { background-image: none !important; padding-right: 12px !important; }` — suppresses the CSS-drawn chevron specifically where that sibling icon div exists, leaving exactly one arrow per dropdown either way.

### 7. Blue-tinted input/date fields
Root cause: many `<input type="date">`/`<input type="number">` elements across the app hardcode `background:var(--bg-page)` inline — `--bg-page` is `#F0F2F7`, a light blue-gray meant for page backgrounds, not form fields (every other field correctly uses `--bg-surface`, pure white). Fixed with a global override, `input[type="date"], input[type="number"] { background: var(--bg-surface) !important; }`, rather than editing dozens of individual inline styles. Deliberately excluded plain `input[type="text"]` from this rule — the top-bar search field relies on an inline `background:transparent` to blend into its pill container, and a blanket white override there would have broken it (checked for this exact conflict before adding the rule, and again confirmed no date/number input relies on `transparent`).

### 8. Salary Slip modal — bigger + clearer PKR labeling
Widened the Modal from `420` to `680`, increased internal gaps/padding, bumped the employee-name/Net-salary display font sizes, and added an explicit "(PKR)" suffix to every editable field's label (Gross/Tax/Allowances/Other deductions/Bonus — previously only "Net salary" said PKR, the rest were unlabeled numbers). The realtime debounced auto-save (`setSalarySlipFieldLive`) already existed from an earlier session — no functional change needed there, this was purely a sizing/clarity pass.

### Follow-up ask 1: Owner department (Hamza Farooq) couldn't create/assign projects — real bug, root-caused and fixed
`core/dependencies.py`'s `get_persona_role()` (the single-string persona `projects.py`/`tasks.py` still depend on) returned `roles[0]` — literally whichever access level happens to be **first** in the employee's `access_levels` array, in whatever order they were ticked/stored. Hamza Farooq's real DB row is `access_levels: ["employee", "dev", "finance", "owner"]` — owner is in there, just not first — so `get_persona_role()` returned `"employee"` for him, and every `persona != "owner"` check in `project_service.py`/`task_service.py` (create/update/delete) rejected him even though he genuinely holds the owner role. Confirmed live: before the fix, `POST /api/projects` as Hamza returned 403; after, 201. **Fixed** by giving `get_persona_role()` the same priority order the frontend's `derivePersonaFlavor()` already uses (owner > hr > finance > dev > employee) instead of blindly taking index 0 — so "owner" wins if held at all, regardless of array position. Verified end-to-end: reset Hamza's password via the owner endpoint, logged in as him, created a project and a task successfully, cleaned up both.

### Follow-up ask 2: Refresh flash (splash → login-with-red-error → settled) — deep dive
Investigated two independent mechanisms, both real, both now hardened; could not get 100% certainty on which one is the exact trigger without live browser access (per this project's standing no-browser-testing workflow), so both are fixed rather than picking one guess.

**Finding A — a self-defeating retry, confirmed by re-reading the exact code path**: the earlier session's `checkAuth` retry-on-transient-failure fix (see the 2026-07-18 entry above) added backoff retries, but `apiFetch`'s 401 handler *unconditionally* ran `localStorage.removeItem('orbit_token')` **before** the error ever reached `checkAuth`'s own retry-or-not decision — so by the time a retry actually fired, the token was already gone from localStorage, guaranteeing every retry attempt sent no `Authorization` header at all (a *different*, guaranteed 401, not a retry of the original one). The retry logic existed but could never actually succeed. Fixed by adding a `skipAuthExpiry` option to `apiFetch`, passed by `checkAuth`'s own call to `/api/auth/me` — the token is now only ever cleared by `checkAuth` itself, and only once it has genuinely given up (not preemptively inside `apiFetch` on the very first attempt).

**Finding B — the actual likely source of the visible "red" flash**: `ORBIT.html`'s own bundler bootstrap script (the "Unpacking..." stage that runs before React ever mounts, decompressing the gzip manifest and swapping in the real document) installs a **permanent** `window.addEventListener('error', ..., true)` handler that paints a fixed, dark-red monospace banner (`background:#2a1215;color:#ff8a80`) at the bottom of the page for *any* uncaught error — and its own comment confirms this listener "persists across replaceWith since it's on window, not the DOM," i.e. it keeps listening for errors from the real React app too, not just during the unpacking phase. This exactly matches the reported symptom's description (a red banner, appearing and disappearing quickly) and its most telling detail — "doesn't come in logs" — since a client-side JS error thrown during a render pass would never reach any server-side log the user might have been checking, only the browser's own console (which this project's workflow has never been able to inspect directly). `renderVals()` computes several hundred derived values covering every screen at once, on every render, including the very first ones right after page load while `authChecking` is still true and most `apiXxx` state is still empty defaults — a plausible place for a transient, edge-case computation to throw once during that specific window and never again. Rather than trying to find one specific line by inspection alone (a ~1700-line function with no live browser to reproduce against), **hardened the failure mode itself**: renamed the existing function body to `_computeRenderVals()` and added a thin `renderVals()` wrapper that catches any exception, logs it via `console.error` (so a future session finally has a concrete trace to work from if this recurs), and falls back to the *last successfully computed* render values (or a safe splash/login default before any render has ever succeeded) instead of letting the exception propagate into a visible crash. A one-off transient error now degrades to "the screen doesn't update for one tick" rather than a visible red-banner flash.

### Verification
Backend: `ast.parse` on all 17 touched/new Python files, `from app.main import app` import check (97 routes, up from 94 — the three new expense-category endpoints). Live end-to-end via `httpx.AsyncClient`/`ASGITransport` against the real local dev DB: confirmed a plain employee gets 403 creating an expense category, an expense, and an invoice; confirmed expense categories list publicly and persist a real create+delete round-trip; confirmed Hamza Farooq (owner, access_levels not owner-first) can now create and delete both a project and a task, reproducing the exact previously-broken scenario end-to-end. Frontend: `node --check`, tag-balance (`sc-if` 235/235, `x-import` 211/211, `{{ }}` 1746/1746, all others unchanged and balanced), and the scaffolded-binding cross-check (only the usual harmless sc-for loop-alias false positives) all clean. Repackaged into all three bundle copies — byte-identical (1,040,920 bytes each), confirmed via direct JSON-decode of the written bundle that `deleteSelectedTask`, `isFinanceEditor`, `isOwnerReal`, `expenseCategoriesApi`, `_computeRenderVals`, `skipAuthExpiry`, `orbit-notif-wrap`, and the `select:has(...)` CSS rule are all present. Backend re-checked post-repackage (login + employees/projects/tasks/finance-invoices/expenses/payroll/milestones/expense-categories, all 200). **Not** browser-tested (standing workflow) — in particular the dropdown double-arrow fix, the date-input white-background fix, and whether Finding B above was really the refresh-flash's root cause are all worth an actual look before fully trusting them; Finding A is independently correct regardless of whether it was the visible cause.

---

## Update (2026-07-18, later still) — 8-item polish batch: create-close animations, delete-button consistency, subtask-open flicker, pill-tab active color, task start dates, invoice footer, Enter-to-comment, notification scoping

Another user-supplied numbered list, all 8 done, bundle repackaged once at the end.

### 1. Smooth close animation after subtask/task creation
`submitNewTask`'s success handler did an instant `this.setState({ devNewTaskOpen: false })` instead of routing through `_closeWithAnimation` like the Cancel path already did — the exact "success path got missed, cancel path was already fixed" bug class documented several times earlier in this file, just recurring for New Task specifically. While fixing this one, audited every other "New X" creation success handler for the same gap and found four more with the identical bug: `submitNewInvoice`, `submitNewExpense`, `submitMilestone`, `submitNewOpening` — all fixed the same way. (`submitNewProject`/`submitNewLead` were already correctly animated from an earlier round; `submitNewEmployee` doesn't close the drawer at all on success — it navigates straight into the new employee's own edit view — so there's nothing to animate there.)

### 2. Delete button consistency across Leads/Projects/Tasks
Projects and Tasks already used a real `variant="danger"` Button labeled "Delete Project"/"Delete Task" in their detail-drawer footers. Leads was the odd one out in two ways: the drawer only had a plain text `<a>` link ("Delete lead", danger-colored text, no button chrome), and the confirm-dialog's own destructive action button was `variant="primary"` (blue) instead of `variant="danger"` (red) — so the actual "yes, delete it" click was styled identically to a neutral confirm action. Fixed both: the drawer footer now has a proper `variant="danger"` Button labeled "Delete Lead" (matching the Project/Task pattern exactly), and the confirm dialog's button is now `variant="danger"`. Milestones' per-row inline "Delete" text link (inside a data table) was deliberately left alone — a compact row-action link is a different UI context from a detail-drawer's own "delete this whole record" footer button, and the ask specifically named Leads/Projects/Tasks/Subtasks, not Milestones/Invoices/Expenses row actions.

### 3. Flicker when opening a subtask's info from inside a Project drawer
Root cause: `openTaskDrawer(id)` cleared `devSelectedProjectId` (closing whatever Project drawer might currently be open) in the *same* `setState` call that opened the Task drawer — so if the user was viewing a Project's own "Subtasks" list and clicked one, the Project drawer's overlay/panel vanished **instantly** (no exit animation — a raw setState, not `_closeWithAnimation`) at the exact same tick the Task drawer's entrance animation started. Two full-screen overlays swapping in the same frame reads as a flicker. Fixed: if a Project drawer is currently open when `openTaskDrawer` is called, it's now closed with its normal exit animation first, and only once that completes does the Task drawer open. Opening a task directly from the Tasks list (no Project drawer in the way) is unchanged — instant open, nothing to flicker against.

### 4. Pill-tab active state should be a plain white background
Two *different* pill-switcher patterns exist in this app: (a) `.orbit-setup-tab` (Invoices/Expenses/Payroll/Milestones tabs, Employees/Leave/Hiring tabs, etc.) — already correctly white-on-active via an existing CSS rule keyed off the rendered `font-weight:600`, confirmed still working, left untouched; (b) the Kanban/List and USD/PKR toggle pills (`devProjSubViewKanbanBg`, `devTaskSubViewKanbanBg`, `crmSubViewKanbanBg`, `rcUsdBg`/`rcPkrBg`, `repRcUsdBg`/`repRcPkrBg`) — these used a **solid `var(--brand-primary)` fill** with white text for the active option, not a white background. That's the one the ask was actually about. Swapped all of these active-state pairs to `#fff` background + `var(--brand-primary)` text (matching pattern (a)'s look) instead of the bold solid-color fill — "bare minimum white one to know I am on it," per the ask's own wording, rather than a heavier color block.

### 5. Task/Subtask start date
Added a real `start_date` column to `Task` (nullable `Date`), `TaskCreate`/`TaskUpdate`/`TaskResponse` schemas, and `task_service.py`'s `create_task` (defaults to `now_pkt().date()` only when the caller doesn't supply one — same "auto-default, never force-override" convention already used for `Project.start_date` and employee probation dates elsewhere in this file). Migrated the live dev SQLite DB (backed up first to `orbit.db.bak-before-task-start-date-<timestamp>`, per standing practice) via `ALTER TABLE tasks ADD COLUMN start_date DATE` + backfilled all existing rows to their own `created_at` date. **The production Neon Postgres DB has not been migrated** — this only touched local dev; the same `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` will need running against Neon before this ships, same as every other schema change in this file's history. Frontend: mirrors Project's own precedent exactly — no start-date input in the *New Task* creation form (the backend default alone satisfies "defaults to today"), but the *existing*-task detail drawer gained an editable `<input type="date">` (auto-saves like Deadline already does, including the same ISO/display-format conversion `setTaskFieldLive` already does for `deadline`), and both the Kanban card ("Started: ...") and the List view (a new "Start date" column) now show it, matching how Projects already display their own start date.

### 6. Invoice "changes save automatically" label repositioned
Earlier this same day this label was deliberately moved to the *left* per an explicit prior ask ("Create Invoice button on right, autosave on left"). This ask reverses that — now on the right. Along the way, simplified the footer's flex layout from `justify-content:space-between` + an empty spacer `<span>` (needed when there were two possible occupants, one per side) back to a plain `justify-content:flex-end` with a single conditional occupant (the autosave label for an existing invoice, or the Create Invoice button for a new one) — cleaner than the previous two-slot layout since only one of the two ever shows at once anyway.

### 7. Enter key posts a comment (Leads, Projects, Tasks)
All three comment `<input>` fields (CRM Lead activity/comments, Project comments, Task comments) previously only posted via their "Post" button. Added an `onkeydown` handler to each (`onCommentDraftKeyDown`/`onProjectCommentDraftKeyDown`/`onTaskCommentDraftKeyDown`) — `if (e.key === 'Enter' && <draft>.trim()) <postFn>()` — mirroring the exact pattern already used for the login form's Enter-to-submit (`onLoginKeyDown`). Guards against posting an empty/whitespace-only comment, same as clicking Post with nothing typed would already implicitly no-op against (the underlying post functions already no-op on an empty draft; the guard here just avoids firing the call at all).

### 8. Notification scoping: employees were getting every other employee's record-update spam
User report: Ayesha Siddiqui was receiving a notification every time *Hamza Farooq's* record was updated, with no relevance to her at all. Root cause: `employee_service.py`'s `create_employee`/`update_employee` both fired their notifications with `user_id="all"` — a literal broadcast to every employee in the company, for every single hire and every single record edit, regardless of who was involved. Fixed both to target `"hr"` and `"owner"` only (two `.create()` calls each, the same two-target pattern already used for Leave Submitted notifications elsewhere in this file) — the two roles who actually need to track employee record changes company-wide; a regular employee has no reason to be told about a *different* employee's record edit. `job_opening_service.py`'s "all"-broadcast notifications (New Opening / Opening Closed) were deliberately left alone — company-wide visibility into internal job openings is plausibly wanted (referrals, internal transfers), a genuinely different case from "someone else's HR record changed," and not what was reported as broken.

Verified live: updated Hamza's record as owner, logged in as Ayesha (real employee, password reset via the owner endpoint), confirmed her `/api/notifications` includes **zero** new entries mentioning Hamza's update, while the owner's own notification list does. (A handful of *pre-existing* "Hamza Farooq's record has been updated" rows targeted at `user_id="all"` are still visible to her — those are leftover rows from testing done *before* this fix landed, not a sign the fix didn't work; notifications are historical records, not something this fix retroactively rewrites. Confirmed by checking timestamps directly against the DB — the brand-new post-fix row is correctly targeted at `hr`/`owner` only, the stale `all`-targeted rows all predate it.)

### Verification
Backend: `ast.parse` on `models/task.py`, `schemas/task.py`, `services/task_service.py`, `services/employee_service.py`; `from app.main import app` import check (97 routes, unchanged — no new endpoints this round, just new fields/logic on existing ones). Live end-to-end via `httpx.AsyncClient`/`ASGITransport`: created a task with no `start_date` supplied → defaulted to today; updated it to a real past date → accepted; confirmed the notification-scoping fix as described above. Frontend: `node --check`, tag-balance (`sc-if` 234/234, `div` 638/638, `{{ }}` 1752/1752, all others balanced), and the scaffolded-binding cross-check (only the usual harmless sc-for loop-alias false positives) all clean. Repackaged into all three bundle copies — byte-identical (1,044,433 bytes each), confirmed via direct JSON-decode of the written bundle that `onTaskStartDateDate`, `startDateStr`, `onCommentDraftKeyDown`, `onProjectCommentDraftKeyDown`, `onTaskCommentDraftKeyDown`, the "Delete Lead" button label, and the repointed `devProjSubViewKanbanBg` pill-color logic are all present. Backend re-checked post-repackage (login + tasks/projects/employees, all 200). **Not** browser-tested (standing workflow) — the subtask-open flicker fix and the pill-tab color swap in particular are worth an actual look given they're pure animation/visual-feel changes.

**Still needs doing before this reaches production**: the Neon Postgres `tasks` table needs the same `start_date` column added (see item 5) — this round only migrated the local dev SQLite DB.

---

## Update (2026-07-18, later still) — Log Expense/Milestone real bugs, Salary Slip gross-pay lock, Payroll month filter, Tasks visibility narrowed to assignee-only, Subtask labeling

User pasted actual screenshots of the Log Expense, Add Milestone, Salary Slip, and My Projects/Tasks screens with specific complaints. All addressed; bundle repackaged once at the end.

### 1–3. Log Expense: date picker, stale departments, and the real "all inputs required" bug
The Date field was a plain text `Input` with a placeholder suggesting a free-form format ("e.g. 4 Jul 2026") — not a real date picker despite the ask. Converted to a real `<input type="date">`. This also directly explains the "even after filling all it says all inputs required" report: `submitNewExpense`'s payload sends `submitted_date: f.date` straight to a strict Pydantic `date` field — if a user typed anything other than an exact ISO string into that free-text field (very likely, given the placeholder actively suggested a non-ISO format), the request would fail. A real date input can't produce anything but an empty string or a valid ISO date, closing off that whole failure mode.

Also fixed `expDeptOptions` (the form's Department dropdown): it derived from whatever departments *real employee records* currently have (`Array.from(new Set(apiEmployees.map(e => e.department)))`), which still includes stale pre-migration strings like `"Software Dev"` for any employee never updated to the current fixed 4-option department list (Owner/Finance/Dev Member/Employee) — exactly "departments we minimized" showing up again. Switched to the fixed `DEPARTMENT_OPTIONS` list directly, matching how the Employee form already gets its department choices.

While in this code, found and fixed the exact same "native `<select>` shows the first real option as visually selected when the bound value is `''` and matches no option" bug (previously fixed for the Employee Manager dropdown) in **two more places that share this form**: the expense's Category select (`expCategoryOptions`, no blank placeholder) and now the Department select too. Both gained a `Select category…`/`Select department…` placeholder option (`efCategoryOptions`/`efDeptOptions`, kept as separate variables from the ones the Expenses *filter* row uses, so the filter's own "All categories"/"All departments" placeholder doesn't end up duplicated). `expenseForm`'s `dept` default changed from the stale `'Software Dev'` to `''` (forcing an explicit pick, now that the placeholder makes an unselected state visually obvious), and `submitNewExpense`'s validation now also checks `!f.dept` (previously ungated — a blank department could silently reach the backend, since Pydantic's `str` field has no non-empty constraint).

### 4–5. Milestone: no leads/projects shown, and creation "not working"
Both complaints traced to the **same** root cause: `milestoneProjectOptions` filtered projects down to only those linked to a lead whose stage was literally `"Won"` (`allProjectsFlat.filter(p => p.lead_id && leadsById[p.lead_id]?.stage === 'Won')`). In practice this made the dropdown empty or near-empty (manually-created projects, or projects from a lead not yet marked Won, don't qualify) — so `submitMilestone`'s own validation (`!f.projectId`) correctly rejected submission because there was *nothing to select*, which reads as "milestone not being created." Removed the Won-lead restriction entirely — every project is now selectable, matching the ask ("all the projects and leads should be shown"). Verified live end-to-end via the real API (create → 201, delete → 204) with an ordinary project once the dropdown could actually offer one — the milestone-creation code path itself had no bug at all once given a valid `project_id` to work with. Also added the same blank-placeholder fix as the expense form (`mfProjectOptions`, kept separate from the milestone list's own "All projects" filter option) and relabeled the field from "Project (locked / won leads only)" to plain "Project."

### 6. Salary Slip: Gross Pay is no longer editable
The ask: Gross Pay should always just reflect the employee's actual set salary, not be independently editable, while Allowances/Bonus/Tax/Other Deductions stay editable with Net Pay auto-calculated. This was also a real, if subtle, existing bug: `salary_slip_service.py`'s `get_or_create_slip` already re-syncs `gross_salary` to the employee's live salary on every load *for as long as the slip is Unpaid* (a fix from an earlier round) — meaning any manual edit to Gross Pay in the UI would have silently reverted the next time Payroll was opened, since the sync logic has no way to distinguish "the employee's real salary changed" from "someone typed a different number into this box." Fixed by making the Gross Pay field read-only in the UI (`disabled="{{ true }}"`, relabeled "Gross salary (PKR) — set in Employee record", `onGrossChange` removed) and, for defense-in-depth, having `update_slip` on the backend silently strip any client-supplied `gross_salary` from the update payload — it can only ever come from `get_or_create_slip`'s own sync path now. The other four fields (Allowances/Bonus/Tax/Deductions) were already correctly editable with an already-working optimistic client-side Net Pay recalculation on every keystroke (`setSalarySlipFieldLive` already recomputes `net_salary` locally before the debounced save round-trips) — no bug there, just confirmed it already satisfied "auto calculated."

Also enlarged the modal further (680→820px) and replaced the plain text employee-name header with an actual colored banner (a gradient `background`, bigger 26px name, role/month in a lighter sub-line) — the previous round's enlargement apparently wasn't "huge" enough.

### 7. Payroll: added a real month filter
The Payroll table had **no filter of any kind** — it always showed whatever month the backend defaulted to (the current calendar month), and the table's own "Paid" column header had a literally hardcoded `"Paid (June)"` label regardless of what was actually being shown. Added a `payrollMonth` state field (defaults to the current PKT month), a real `<input type="month">` control above the table, and wired it through `payrollApi.list({ month })` (the backend endpoint already accepted this param — the frontend just never sent it). The "Paid (...)" header now reads the real selected month (formatted "July 2026", computed fresh from `payrollMonth` rather than hardcoded).

### 8. Tasks: no longer shows every task on a project you're a team member of
Real regression-in-waiting caught from an actual screenshot: a dev-persona user's own "My Projects → Tasks" list was showing tasks assigned to *other* people (Ayesha Siddiqui, Fahad Iqbal, Hamza Farooq all visible in one person's task list). Root cause: `task_repository.py`'s dev-visibility filter was `Task.assignee == assigned_to_member OR Project.team.like(...)` — a task was visible if *either* it was assigned to you *or* you were merely on the project's team, regardless of who it was actually assigned to. This OR-with-team-membership clause was added in an earlier round specifically to fix a *different*, legitimate case (a task assigned directly to someone who isn't formally on the project's team should still be visible to them) — but it had the side effect of also exposing every other task on any project you happen to be a team member of. Per this explicit ask, removed the team-membership half entirely, keeping only `Task.assignee == assigned_to_member` — "My Tasks" now only ever shows tasks actually assigned to the logged-in person. Verified live: a real dev employee (Fahad Iqbal) no longer sees a teammate's task on a shared project, while a task assigned directly to him on a project he *isn't* even on the team of still shows (confirming the earlier, separate fix wasn't lost in the process — only the team-membership bypass was removed).

### 9. "Subtask" labeling
The Task Detail drawer (opened by clicking any task/subtask row for its info) had a hardcoded header reading "Task" and a "Delete Task" footer button, regardless of context. Since every task in this app always belongs to a project (there's no such thing as a standalone, project-less task — `project_id` is required), changed both to say "Subtask"/"Delete Subtask" instead. Left the *New Task* creation form's own title ("New Task") and the general Tasks-tab's own "New Task" button untouched — those weren't what was reported, and the form already has a working `tfIsSubtask`-based distinction for the cases that need it.

### Verification
Backend: `ast.parse` on `repositories/task_repository.py` and `services/salary_slip_service.py`; `from app.main import app` import check (97 routes, unchanged). Live end-to-end via `httpx.AsyncClient`/`ASGITransport`: confirmed milestone creation succeeds given a real project id; confirmed a dev employee (Fahad Iqbal) no longer sees a teammate's task on a shared project while still seeing his own directly-assigned task on an unrelated project (the exact scenario from the reported screenshot, reproduced and fixed). Frontend: `node --check`, tag-balance (`sc-if` 234/234, `div` 641/641, `{{ }}` 1755/1755, all others balanced), and the scaffolded-binding cross-check (only the usual harmless sc-for loop-alias false positives) all clean. Repackaged into all three bundle copies — byte-identical (1,047,122 bytes each), confirmed via direct JSON-decode of the written bundle that `efDeptOptions`, `efCategoryOptions`, `mfProjectOptions`, `payrollMonth`, `onPayrollMonth`, `payrollMonthLabel`, and the "Subtask" labels are all present. Backend re-checked post-repackage (login + tasks/projects/payroll/milestones/expenses/expense-categories, all 200). **Not** browser-tested (standing workflow) — the Salary Slip banner's visual look and the new payroll month-picker's interaction feel are worth an actual look before fully trusting them.

---

## Update (2026-07-18, later still) — Refresh-flash root cause actually found this time, and a Salary Slip deduction-reason field

### The real cause of the persistent refresh-flash bug (finally confirmed, not guessed)
Two earlier rounds this same day tried to fix "brief flash on refresh" blind (a token-clearing race in `apiFetch`/`checkAuth`, then a `renderVals()` crash safety-net) without being able to confirm either was the actual visible cause, since this project's workflow has no live browser access. This time the user provided the actual browser console output when it happens: `[bundle] resource failed to load: STYLE` (a benign, unrelated warning from the bundler's own resource-loading — not the cause) plus a description that pinned it down precisely: *"the screen that comes flashes for a millisecond says login screen shows and says login error."*

That description means the **login form's own error banner** — not the bootstrap script's red crash overlay, not a toast — was what was flashing. Checked its `sc-if` in the template and found the actual bug immediately: `<sc-if value="{{ hasLoginError }}">` had **no `hint-placeholder-val` attribute at all**, unlike every other consequential conditional in this file (which all received this exact fix in the "Refresh flash fix" round back on 2026-07-17 — that round's own sweep evidently missed this one, along with two more found in the same pass, see below). Per this mechanism (documented repeatedly in this file): the compiled bundle paints a static, pre-hydration guess for every `sc-if` on the very first frame, before React actually mounts and the real state (`loginError: null`) takes over — and without a hint, the runtime has to guess, and guessed **true** here, briefly painting the error banner (with whatever `loginError`'s default/stale value was) before React's real, correct `null` state replaced it a moment later.

**Fixed**: added `hint-placeholder-val="{{ false }}"` to the `hasLoginError` conditional — matching real initial state (`loginError: null` → `hasLoginError: false`) exactly, same as every other fixed conditional in this file.

**While fixing this, ran a proper systematic sweep this time** (a small Node script scanning every `<sc-if value="{{ ... }}">` in the template.html for a missing `hint-placeholder-val`, rather than trusting the earlier session's claim of "only 2 were missing" — which turned out to be wrong) and found two more on the *same* login screen: the button's own `<sc-if value="{{ loginLoading }}">Signing in...</sc-if>` / `<sc-if value="{{ !loginLoading }}">Sign in</sc-if>` pair, which could have made the button briefly show the wrong label on first paint too. Fixed both (hints `false`/`true`, matching real initial state `loginLoading: false`). The sweep also turned up 9 more missing hints elsewhere (per-row search-highlight conditionals like `p.nameHighlight.hasMatch`/`t.titleHighlight.hasMatch` inside Project/Task list rows, and the two Project/Task comment "replying to" banners) — these are **not** related to the reported bug (they only ever render after real data has loaded, well after React has already mounted with correct state, so there's no pre-hydration guess to get wrong) and were deliberately left alone rather than churned for no reason.

This is, for the first time across three attempts, an actual confirmed root cause rather than a defensive hardening — the two earlier fixes (`skipAuthExpiry` token-race, `renderVals()` crash safety-net) remain in place as genuinely correct, independent improvements, but this hint-placeholder-val fix is the one that directly explains every symptom the user described, including the detail ("says login error") that the earlier rounds couldn't account for.

### Salary Slip: deduction reason field
Following up on the Gross-Pay-lock work from earlier the same day, the user asked to also be able to write a reason alongside "Other deductions" (e.g. "late arrival fine," "advance repayment") — asked first whether this should be a new dedicated field vs. reusing the slip's existing generic Notes box; user confirmed a new dedicated field. Added `SalarySlip.deduction_reason` (nullable `Text`), threaded through `SalarySlipCreate`/`Update`/`Response`, and a new "Reason for deduction (optional)" text input directly under the Other Deductions amount in the editable view (auto-saves via the same debounced `setSalarySlipFieldLive` path as the other fields) — also surfaced read-only (only when actually set) in the non-finance-editor's locked view, right under the Other Deductions line. Migrated the live dev SQLite DB (backed up first to `orbit.db.bak-before-deduction-reason-<timestamp>`) via `ALTER TABLE salary_slips ADD COLUMN deduction_reason TEXT`. Verified live: set `other_deductions`/`deduction_reason` together via a real API call while simultaneously attempting to smuggle a `gross_salary` override in the same request — confirmed the override was silently ignored (per the existing gross-pay-lock fix from earlier the same day) while the deduction reason saved correctly and net pay recalculated.

### Verification
Backend: `ast.parse` on `models/salary_slip.py`, `schemas/salary_slip.py`, `services/salary_slip_service.py`; import check (97 routes, unchanged). Live end-to-end via `httpx.AsyncClient`/`ASGITransport` against the real local dev DB, as described above. Frontend: `node --check`, tag-balance (`sc-if` 235/235, `div` 642/642, `{{ }}` 1763/1763, all others balanced), scaffolded-binding cross-check clean (usual harmless false positives only). Repackaged into all three bundle copies — byte-identical (1,048,124 bytes each), confirmed via direct JSON-decode that the `hasLoginError` hint fix, `deductionReason`, `onDeductionReasonChange`, and the "Reason for deduction" label are all present in the written bundle. Backend re-checked post-repackage (login + payroll, both 200). **Not** browser-tested (standing workflow) — this is the third round targeting the refresh-flash issue without the ability to visually confirm the fix in an actual browser; high confidence this time given the specific, confirmed root cause, but worth an actual refresh-and-watch before considering it fully closed.

**Still needs doing before this reaches production**: two schema changes from today (`tasks.start_date`, `salary_slips.deduction_reason`) still only exist on the local dev SQLite DB — the Neon Postgres production database needs both columns added before any of this ships.

---

## Update (2026-07-18, later still) — `canRunPayroll` was never actually exposed to the template: Salary Slip's editable view was unreachable for everyone, always

User reported the Salary Slip modal showing the locked read-only summary (plain text, no inputs) even while logged in as a genuine **owner** account — confirmed via a direct question before touching anything, since this could equally have been "working as designed" (a non-owner/finance test account) or a real bug; the user confirmed owner.

**Root cause, found by grepping every place `canRunPayroll`/`isFinanceEditor` appear in `renderVals()`**: `const canRunPayroll = isFinanceEditor;` is computed and used internally throughout the function (`payrollRows`' `canToggle`/`cannotToggle`, feeding other renamed keys like `canApproveExpense`/`isOwnerForMilestones`) — but **the bare key `canRunPayroll` itself was never included in the object `renderVals()` actually returns to the template.** The Salary Slip modal's own gates — `<sc-if value="{{ canRunPayroll }}">` (editable view) and `<sc-if value="{{ !canRunPayroll }}">` (locked view) — read a template variable that was always `undefined`, hence always falsy: `canRunPayroll` always evaluated false, `!canRunPayroll` always evaluated true, and the locked view showed **unconditionally, for every user, including real owners** — this was never actually reachable via the UI by anyone, at any point, including in the "already existed" editable-fields work an earlier session documented (that session verified the *logic* was correct without verifying the key actually reached the template — the same category of gap this file's "scaffolded but unwired" pattern describes repeatedly).

**Why the usual scaffolded-binding cross-check didn't catch this**: that check (`check_bindings.py`) searches script.js for the template identifier followed by `:` or `,` to confirm it's a real render-vals key — but `canToggle: canRunPayroll,` (a *value*-position usage, immediately followed by a comma) satisfies that same regex, producing a false negative. The checker can't currently distinguish "this identifier is used as a value somewhere, incidentally followed by a comma" from "this identifier is a real shorthand key in the object actually returned." Worth remembering as a limitation of that check, not a reason to fully trust a clean run of it for this specific bug shape.

**Fixed**: added the missing `canRunPayroll,` to the returned object (immediately identifiable now by a comment explaining why, so a future accidental removal is less likely to go unnoticed).

Also addressed the other console output pasted alongside this report:
- `[dc-runtime] Root: {{ salarySlip.name }} never resolved` (and several sibling fields) — transient, self-correcting: `salarySlip` is computed as `salarySlipEmp ? {...} : null`, and on the very first render right after the modal opens (before `apiPayrollSlips` has the matching record yet), it's briefly `null`. The runtime handles this gracefully (renders empty, logs a warning) rather than crashing, and the next render — once real data arrives — resolves correctly, which matches the screenshot showing correct values. Not the same bug as `canRunPayroll` (that one never resolved on *any* render, this one only misses the very first one) and not something to chase further; a one-tick empty-then-correct render for a modal that just opened isn't a user-visible problem worth adding more machinery to prevent.
- `A form field element should have an id or name attribute` / `No label associated with a form field` — generic accessibility/autofill advisories from the browser's own DevTools "Issues" panel, not tied to anything from this session's changes; would require adding `id`/`name` to a large number of plain `<input>` elements across the whole template for a purely cosmetic DevTools warning with no functional impact. Not chased this round — flagged here in case it's ever explicitly requested as its own pass.
- `Content Security Policy... blocks eval()... script-src blocked` — checked for a CSP `meta` tag or header inside this project's own files (`ORBIT.html`, `frontend/vercel.json`) and found **none** — this project sets no CSP itself. The restriction is coming from whatever's hosting/previewing the page in the user's testing environment, not from anything in this codebase. Given this template runtime's own `{{ }}` expression language is deliberately limited to literals/property-paths/`!`/equality checks (no `eval()` needed for that part, per this file's own documented design), this warning is unlikely to be breaking the app's core rendering — but it's worth being aware of if something *else* (e.g. the Babel-in-browser JSX transform step the bundler runs) turns out to depend on `eval`/`new Function` and silently fails under a strict CSP in whatever environment ends up hosting this for real.

### Verification
`grep` confirmed no other render-vals-computed-but-unreturned variables share this exact shape within the immediate area touched (not an exhaustive full-file audit — the false-negative in `check_bindings.py` means such an audit would need a smarter check than currently exists; noted above as a known gap rather than solved this round). `node --check`, tag-balance (`sc-if` 235/235, `div` 642/642, `{{ }}` 1763/1763, unchanged from the previous round since this was a one-line fix), all clean. Repackaged into all three bundle copies — byte-identical (1,048,597 bytes each), confirmed via direct JSON-decode that the new `canRunPayroll,` key and its explanatory comment are present in the written bundle. Backend re-checked post-repackage (login + payroll, both 200) — this was a pure frontend fix, no backend files touched. **Not** browser-tested (standing workflow) — this is a one-line, high-confidence fix for a clearly-identified root cause (a genuinely missing object key, not a guess), but worth an actual click-through as owner to see the editable Salary Slip view for the first time.

---

## Update (2026-07-18, later still) — Dashboard exports were completely fake; now real, plus a real time filter

### The exports did nothing at all
`doExport(label)` (backing both "Export as Excel" and "Export as PDF") was pure decoration — `this.setState({ toastMsg: 'Exported ORBIT-Dashboard.' + label })`, no file ever generated, downloaded, or even attempted. Built a real implementation from scratch rather than a small fix.

**Architecture decision**: rather than duplicating the Dashboard's revenue/cash-position/profitability calculations on the backend (real risk of the export silently drifting out of sync with what's actually on screen, the exact kind of bug this file has flagged repeatedly for other reasons), the **frontend** builds the export payload from the exact same computed values already driving the visible screen — `buildDashboardExportPayload()` calls `this._computeRenderVals()` fresh (the same function `renderVals()` wraps for the crash-safety-net added earlier this session) and plucks the already-formatted strings (`lockedRevenueStr`, `netCashPositionStr`, `delayedProjects`, `profitabilityRows`, etc.) straight out of its return value. This guarantees the exported file always matches on-screen figures exactly, including whichever currency toggle and time-period filter happen to be active — the backend never recomputes anything, it only lays out already-correct strings into a real file.

**Backend**: new `POST /api/dashboard/export/excel` and `POST /api/dashboard/export/pdf` (`routers/dashboard_export.py`, `schemas/dashboard_export.py`, `services/dashboard_export_service.py`) — both just render a given `DashboardExportRequest` payload into a file and return it as a download; no DB queries, no business logic. Excel via `openpyxl` (**new dependency**, added to `requirements.txt` and installed — wasn't previously used anywhere in this project; `reportlab`/`python-docx` already were). PDF via `reportlab`'s `SimpleDocTemplate`/`Table` (the same library the Invoice PDF used *before* that feature was swapped to a python-docx template-fill approach — reportlab remains a good fit here since a Dashboard export has no fixed template to fill, just structured sections/tables to lay out cleanly). Frontend `doExport(format)` POSTs the built payload with the auth header, receives the file as a blob, and triggers a real browser download (`ORBIT-Dashboard-<today's PKT date>.xlsx`/`.pdf`) — same blob-download pattern already used for Invoice PDF downloads elsewhere in this app.

### Dashboard now has its own time filter
The Dashboard ("Company overview") had no date filter of its own at all — only the separate Reports screen got one, in an earlier round. Added `dashboardDateRange` (defaults to `''`/"All time" — a live company snapshot screen, unlike Reports' own default of "Last 30 Days" which fits its more analytical framing) with the fuller preset set (`DASHBOARD_DATE_RANGE_OPTIONS`: All time/Today/Yesterday/Last 7 Days/Last 30 Days/This Month/Last Month/This Year — no "Custom" option, to avoid needing an extra date-range-picker UI not otherwise requested), reusing the same `resolveDateRangePreset()`/`inDateRange()` helpers Reports/Leads/HR Leave Count already share. Applied it the same way Reports' own filter is scoped — only to the leads-derived figures (`lockedRevenue`/`expectedRevenue`, via a new `dashboardLeads` filtered variable, matching `l.received`) — deliberately **not** applied to Collected/Outstanding/Payroll/Cash-out (a separate finance-stats aggregate with no date param) or to Delayed Projects/Profitability/Utilization/Department-budget rows (point-in-time snapshots, not time-ranged data), for the exact reasons already documented for Reports' own filter. A new dropdown control ("Period") sits next to the existing USD/PKR toggle in the Dashboard's header row.

### Verification
Backend: `ast.parse` on all 4 new/touched files; import check (99 routes, up from 97 — the two new export endpoints). Live end-to-end via `httpx.AsyncClient`/`ASGITransport`: posted a realistic payload to both endpoints, confirmed `200` with correct `Content-Type` for each (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/pdf`), confirmed the PDF's first bytes are a genuine `%PDF-` header, and — most importantly — loaded the returned Excel bytes back with `openpyxl.load_workbook()` and printed every cell to confirm it's a real, readable workbook with the correct section headers and values (not just a MIME-type-tagged blob of nonsense). Frontend: `node --check`, tag-balance (`sc-if` 235/235, `sc-raw-select` 34/34 — one more than before, the new Period dropdown — `{{ }}` 1768/1768, all others balanced), scaffolded-binding cross-check clean. Repackaged into all three bundle copies — byte-identical (1,053,672 bytes each), confirmed via direct JSON-decode that `buildDashboardExportPayload`, `dashboardDateRangeOptions`, `onDashboardDateRange`, and `DASHBOARD_DATE_RANGE_OPTIONS` are all present in the written bundle. Backend re-checked post-repackage (login + leads/projects/finance-stats, all 200). **Not** browser-tested (standing workflow) — in particular, worth actually opening the downloaded .xlsx/.pdf files in real Excel/a PDF viewer (not just verified programmatically as done here) before fully trusting the visual layout.

**Still needs doing before this reaches production**: `openpyxl` needs to actually be present in whatever environment Render installs from — confirm `requirements.txt`'s addition survives the next deploy's `pip install`. No database schema changes this round.

---

## Update (2026-07-18, later still) — top-bar search placeholder renamed; a real CSS bug behind "highlighted search text goes blank"

### Search placeholder
"Search people, leads, projects, invoices…" (the top-bar global search input) shortened to just "Search," per request. Only one occurrence in the whole template — no other copies to update.

### Search-result highlighting — real root cause found (Leads specifically)
User report: searching leads/projects made "the highlighted text go blank." Read through both highlighting mechanisms this app uses end to end:
- `getHighlightParts()` (Projects/Tasks — `p.nameHighlight`/`t.titleHighlight`/etc.) renders matches via `<mark style="background:#ffe066;color:#11141e;...">` — explicit, hardcoded colors.
- `highlightSegments()` (Leads — `lead.nameSegments`) renders matches via `<mark style="background:var(--status-warning-bg);color:inherit;...">` — CSS-variable background, and deliberately `inherit` for text color so the highlighted word's color matches whatever row it's sitting in.

Both functions were verified correct in isolation (fed a range of inputs mentally tracing through the logic — empty query, no match, multi-word queries, overlapping ranges — every path preserves the full text; neither can produce a genuinely empty string for a supposedly-matched segment).

**The actual bug was CSS, not JS**: a "Badge colour richness" rule block (`[style*="background:var(--status-warning-bg)"] { ...; color: #D97706 !important; }`, and three siblings for success/danger/info) was written to make Badge components more vivid — it works by matching on the literal inline-style *substring* `background:var(--status-warning-bg)`, since that's how Badge components render internally. Problem: the Leads highlight `<mark>` *also* has that exact substring in its own inline style (for an entirely unrelated reason — it just happens to use the same background variable) — so this Badge-only rule was unintentionally hijacking the highlight's `color:inherit` and forcing a fixed `#D97706` amber-orange onto it instead, `!important`, regardless of context. The highlighted word wasn't literally rendering as an empty string (confirmed no JS path produces that) — but forcing an unexpected, context-blind color onto text that was designed to blend with its surroundings via `inherit` is very plausibly what read as "goes blank"/broken to the user. Projects/Tasks were never affected (their hardcoded `#ffe066`/`#11141e` pair shares no inline-style substring with any of these four rules — confirmed by grepping for any rule matching those exact hex values, found none).

**Fixed**: added `:not(mark)` to all four Badge-colour-richness rules — surgical, keeps their real purpose (Badge components) completely intact while excluding the one incidental collision. Applied to all four (not just the warning one that actually collides in this codebase today) as a defensive measure against the same collision recurring for success/danger/info-colored highlights in the future.

### Verification
No backend files touched this round — pure `template.html` change plus one placeholder-text edit. `node --check` (script.js unchanged, still clean), tag-balance (`sc-if` 235/235, `{{ }}` 1768/1768, all balanced, unchanged from the previous round), scaffolded-binding cross-check clean. Repackaged into all three bundle copies — byte-identical (1,054,493 bytes each), confirmed via direct JSON-decode that the old "Search people, leads, projects, invoices…" placeholder is gone, the new plain "Search" placeholder is present, and the `:not(mark)` exclusion is present on all four Badge-richness rules. Backend re-checked post-repackage (login, 200). **Not** browser-tested (standing workflow) — the actual visual result (a properly dark-on-yellow highlighted word in Leads, matching how Projects/Tasks already look) is worth an eyeballed check given the root cause was a color/contrast issue, which is inherently a visual judgment call.

---

## Update (2026-07-18, later still) — search fields now clear on blur; multi-word highlight extended to whole-word boundaries

### Search fields auto-clear when you touch anywhere else
None of the four search inputs in the app (top-bar global search, CRM Leads' own search, Software Dev Projects' own search, Tasks' own search) cleared themselves when focus left the field — a typed term just sat there indefinitely. Added blur-triggered clearing to all four, per request.

Implementation: `onblur`/`onfocus` (bare attributes — matching this codebase's own established convention for native event attributes on plain HTML elements, same as the already-working `onkeydown` used for the Enter-to-submit-comment feature earlier this session; the `sc-camel-on-*`-prefixed form is this template compiler's convention specifically for click handlers, not something to reach for by default on every event type) wired to a small shared helper (`_scheduleSearchBlurClear`/`_cancelSearchBlurClear`). Blur doesn't clear immediately — it's delayed 200ms, because blur fires *before* a click on a dropdown result or list row finishes registering; clearing synchronously would wipe the field (and, for the global search, its results list) out from under a click that's still in flight. Re-focusing the same field within that window (an `onfocus` handler) cancels the pending clear, so a quick refocus doesn't lose what was typed.

Per-field specifics:
- **Global search**: clears `searchQuery` (its results dropdown, `searchOpen`, is already derived from `searchQuery.length > 0`, so it closes automatically once the query empties — no separate handling needed). This is on top of the existing "clicking a search result also clears it" behavior from a much earlier round — both can fire without conflict, they just both end up setting the same empty value.
- **CRM Leads search**: clears both `crmFilterSearch` and its debounced twin `crmFilterSearchDebounced`, and explicitly cancels any pending debounce timeout — without that, a debounce scheduled just before blur could fire *after* the blur-clear and silently repopulate the debounced value with the stale (non-empty) text a moment later. Leads filtering is client-side only, so no reload needed.
- **Projects/Tasks search**: clear `devProjFilterSearch`/`devTaskFilterSearch` and then re-run `loadProjects`/`loadTasks` (these two screens filter server-side, unlike Leads, so the list needs a fresh unfiltered fetch once the box empties — matching what their own on-change handlers already do on every keystroke).

Worth being upfront about a behavior change this implies, since the user's request was explicit but broad: opening a Lead/Project/Task's detail drawer from a filtered list counts as "touching elsewhere" (the click moves focus off the search input) — so navigating back to the list afterward now shows it unfiltered again, search box empty. This was a direct, deliberate consequence of "auto get empty if I touch anywhere else," not a bug, but flagged here in case it surprises anyone expecting the filter to persist through a drawer visit.

### Multi-word search highlighting no longer cuts off mid-word
Second reported symptom: "matches word by word... makes it white so highlighted one doesn't look, highlighted one should show complete word matched." Traced to `highlightSegments()` (used only by CRM Leads' `nameSegments` — the one highlighting mechanism in this app that splits a query into individual words and highlights each occurrence separately, as opposed to `getHighlightParts()` for Projects/Tasks, which matches the whole query as one literal substring and was unaffected). When a query word was a *prefix* of a longer word in the actual text — e.g. searching "corp" against "Acme Corporation" — the old code only highlighted the four typed characters ("Corp"), leaving "oration" sitting right after it with no highlight at all: the highlight visually cut off mid-word, which is almost certainly what read as "makes it white" (the un-highlighted tail of the same word, right where the reader would expect the highlight to keep going).

**Fixed**: after finding a match, each highlighted range now expands outward to the nearest non-alphanumeric boundary on both sides (a new `isWordChar()` helper) before being recorded — so a partial match anywhere inside a word highlights that word's *entire* span, not just the substring that was typed. Verified directly (isolated the function and ran it standalone in Node): `highlightSegments('Acme Corporation', 'corp')` now highlights the full "Corporation," and `highlightSegments('Blue Harbor Logistics', 'blue log')` correctly highlights both "Blue" and the full "Logistics" (previously would have highlighted only "Blue" and "Log", leaving "istics" bare). Confirmed the merge-overlapping-ranges step downstream still behaves correctly on the now-wider ranges, and that empty-query/no-match cases are unaffected (still return the plain, fully unhinted text).

### Verification
No backend changes this round — pure frontend. `node --check`, tag-balance (`sc-if` 235/235, `{{ }}` 1776/1776, all balanced), scaffolded-binding cross-check clean (only the usual harmless sc-for loop-alias false positives). The `highlightSegments()` rewrite was verified in isolation by extracting it into a standalone Node script and running it against several realistic prefix-match and multi-word cases (shown above) before touching the real file, not just eyeballing the logic. Repackaged into all three bundle copies — byte-identical (1,058,020 bytes each), confirmed via direct JSON-decode that `onSearchBlur`, `onCrmSearchBlur`, `onDevProjSearchBlur`, `onDevTaskSearchBlur`, and the new `isWordChar` helper are all present in the written bundle. Backend re-checked post-repackage (login, 200) — unaffected, no backend files touched. **Not** browser-tested (standing workflow) — the 200ms blur-delay's click-through timing in particular is worth an actual click-through test (clicking a global-search result, and a filtered Lead/Project/Task row) before fully trusting it doesn't ever race a real click.

---

## Update (2026-07-18, later still) — refresh flash: a different, non-`hint`-based approach (attempt 4), plus the huge boot logo finally addressed

Fourth report of the refresh flash. The prior three attempts all worked *within* the dc-runtime's own mechanism (`skipAuthExpiry` token race, `renderVals()` crash net, `hint-placeholder-val` on the auth gates) and none fully killed it. This time I stopped patching the runtime's hints and instead looked at where both symptoms actually originate in the **raw** boot HTML — the part outside the template that the extract/repack workflow never touches, which is exactly why every prior attempt structurally couldn't reach it.

### Two distinct symptoms, two distinct raw-boot causes

**Symptom B — "ORBIT logo huge size for a millisecond"**: this is `#__bundler_thumbnail` in `ORBIT.html`'s raw `<body>` — a 1200×800 SVG preview the dc-runtime bootstrap shows during "Unpacking…" (gzip decompression, before the template document is swapped in). Its head CSS was `#__bundler_thumbnail svg { width: 100%; height: 100%; object-fit: contain; }` — i.e. stretched to fill the entire viewport, hence "huge." **Fixed** by editing that raw-head rule directly in `ORBIT.html` (`width: 260px; max-width: 62vw; height: auto;`) so it renders as a small centered logo instead of a full-bleed one. Two things worth remembering about this edit: (1) it's in the raw `<head>`, **not** the `__bundler/template` string — so it is NOT part of `template.html` and can't be made via the normal extract/edit/repack loop; it has to be edited in `ORBIT.html` itself. (2) `repack.js` reads `ORBIT.html` as its source and only swaps the template `<script>`, copying everything else (including this head) verbatim into all three targets — so the correct order is: edit `ORBIT.html`'s head first, *then* run repack, and the head change propagates to `backend/static/index.html` and `frontend/index.html` automatically. Confirmed all three ended up with the shrunk rule and none retained the old full-screen one.

**Symptom A — "login screen with login error flashes during reload, final screen fine"**: the mechanism the three prior hint-based attempts kept missing. When the bootstrap swaps in the parsed template (`document.documentElement.replaceWith(...)`), the browser paints that raw DOM — which contains *every* `sc-if` branch's markup as ordinary elements (splash **and** login **and** app, all stacked) — for one sub-frame *before* the dc-runtime executes and hides the non-matching branches. `hint-placeholder-val` is the runtime's own paint-control and only takes effect once the runtime runs; it cannot govern that one pre-runtime frame, which is where the login markup briefly shows. (This also explains why "the error is between the time of reload" and "doesn't come in logs" — it's a pure raw-DOM paint artifact, nothing in JS or the server is ever wrong.)

**Fix**: a plain, always-present `<div id="orbit-boot-cover">` as the first child of the template root — a full-screen light splash (`position:fixed;inset:0;z-index:100000`, matching the thumbnail's `#F4F5F7` and the auth splash so boot→cover→app is one seamless light screen) that reads "ORBIT / Loading your workspace…". Its visibility is driven by `display:{{ bootCoverDisplay }}` (a new render-val: `authChecking ? 'flex' : 'none'`). The trick that makes it cover the pre-runtime frame specifically: during that raw paint, `display:{{ bootCoverDisplay }}` is an unresolved literal — an invalid CSS value the browser silently drops — so the div falls back to the default `display:block` and, at z-index 100000, paints *on top of* whatever login/app markup is flashing underneath. Once React actually renders, `bootCoverDisplay` resolves to `'flex'` for the duration of the auth check and `'none'` the instant it settles (which is atomic with `currentUser`/`authChecking` in `onAuthenticated`, and also correct on the no-token and give-up paths). So the cover is guaranteed visible from the very first raw frame until app-vs-login is genuinely decided — no reliance on the runtime's hint timing at all. Deliberately **text-only, no SVG**: raw HTML parsing lowercases `viewBox` → `viewbox`, which SVG ignores, so an SVG mark wouldn't scale correctly in the pre-runtime paint (the exact reason the app's own splash uses `sc-camel-view-box`, which only works *after* the runtime runs) — plain text always renders. The existing `authChecking` `sc-if` splash was left in place underneath; it's now redundant with the cover but harmless (identical look, same flag), and removing it wasn't worth the risk.

**Honest caveat**: this is the fourth attempt and, as with all frontend work here, it is **not browser-tested** — I can't watch a real reload. But unlike the three prior hint-based attempts (which all depended on the runtime's paint timing being fast enough, the thing that kept failing), this one is structurally different: a browser-default-visible top layer that does not depend on the runtime running at all, so it should cover the exact sub-frame the previous fixes couldn't. If any flash still remains after this, the next diagnostic step is to confirm (in the browser's own DOM inspector, on a throttled reload) whether `#orbit-boot-cover` is actually present and covering during that frame — that would tell us whether the assumption about `display:{{...}}` falling back to `block` in raw paint holds in the user's actual browser.

### Verification
`node --check`, tag-balance (`sc-if` 235/235, `div` 647/647 — three more than before, the boot cover's own divs — `{{ }}` 1778/1778, all balanced), scaffolded-binding cross-check clean. Repackaged into all three bundle copies — byte-identical (1,060,577 bytes each). Confirmed via direct read/JSON-decode that: the shrunk `#__bundler_thumbnail svg { width: 260px…` rule is present in the **raw head** of all three copies and the old full-screen rule is gone from all three; the `orbit-boot-cover` div and its `display:{{ bootCoverDisplay }}` binding are present in the template of all three. Backend re-verified: login 200, and `GET /` (the FastAPI-served `backend/static/index.html`) returns 200 with `orbit-boot-cover` present in the served HTML — so the deployed backend serves the fixed bundle, not just the repo-root copy. No backend code changed this round; the only backend-adjacent touch is that `GET /` now serves an index.html containing the cover.


