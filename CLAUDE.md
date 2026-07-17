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

