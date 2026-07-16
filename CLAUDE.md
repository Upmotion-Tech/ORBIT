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
