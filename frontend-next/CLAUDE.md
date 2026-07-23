@AGENTS.md

# frontend-next — Agent Reference

This is the **only frontend in this repo**. It's a from-scratch Next.js (App Router, TypeScript) port of what used to be a second, older frontend — a single-file HTML SPA bundle (`ORBIT.html` / `backend/static/index.html` / `frontend/index.html`, built from `unpacked/template.html` + `unpacked/script.js` via `pack.py`) that has since been **deleted entirely**. If you see a reference to `unpacked/`, `pack.py`, `ORBIT.html`, or `../frontend/` anywhere, it's describing something that no longer exists in this repo — treat it as historical context about where a piece of logic originally came from, not a live file path. Read `../CLAUDE.md` first for the overall ORBIT project (backend architecture, RBAC model, PKT timezone standard, DB rules) — everything there still applies. This file covers only what's specific to this frontend.

**Standing constraint: never touch the database.** Neon Postgres is live in production. This app only ever reads/writes through the existing FastAPI backend's REST API — no schema changes, no direct DB access (a few backend changes have been made over time — new columns, new dependency wiring — but always through the backend's own migration/service layer, never a direct DB edit from here).

## Why this exists / what it is

The original app was real React 18, just packaged as one self-extracting HTML file with a proprietary template-tag runtime (`sc-if`, `sc-for`, `sc-raw-table`, `x-import`, `{{ }}` interpolation). This app ports every screen 1:1 into ordinary Next.js routes/components, preserving the visual design, API contracts, and — per an explicit decision made at the start of the port — the original's pre-existing quirks and code duplication (3 separate Kanban implementations, 6 near-identical highlight/search patterns, duplicated New-vs-Existing forms in CRM/HR) rather than refactoring them into shared abstractions along the way. **Do not consolidate that duplication unless explicitly asked** — it was preserved on purpose, not missed.

Every screen (Shell/Auth, Me, Manager Hub, Dashboard/Reports, CRM, Customers, Dev, Finance, HR, Setup) is ported and machine-verified. Since then, several rounds of real fixes and new features have landed on top of the port (see "Notable ones" below and git history) — this is an actively developed app now, not a frozen migration snapshot.

## File-by-file: what's where and why

### Root
- **`next.config.ts`** — proxies `/api/:path*` to `process.env.ORBIT_BACKEND_ORIGIN || "http://localhost:8000"`. Without this, every API call from `orbit-client.js` (which uses same-origin-relative `/api/...` paths) 404s against Next.js's own dev server instead of reaching FastAPI. This is also the production rewrite — no separate `vercel.json` needed.
- **`AGENTS.md`** — warns that this Next.js version (16.2.11) may differ from training-data assumptions; the real docs are vendored at `node_modules/next/dist/docs/`. Worth a skim before assuming any App Router API/convention if something behaves unexpectedly.

### `src/app/layout.tsx`
Root layout. Loads `Inter` via `next/font/google`, imports `globals.css`, wraps everything in `ToastProvider` → `AuthProvider` → `AuthGate`. `AppDataProvider` is **not** here — it's mounted inside `AuthGate`'s authenticated branch (so it only starts loading cross-cutting data once there's a logged-in user).

### `src/app/globals.css`
Design tokens, login screen "Light Glassmorphism" styles, sidebar/topbar/card/table hover polish, Kanban/tab/settings-row micro-animations — ported verbatim from the original app's CSS. If a screen looks visually wrong, check here first for a missing class before assuming a logic bug.

### `src/lib/orbit-client.js`
Deliberately kept as `.js`, not `.ts` — a near-verbatim port of the original's shared helpers and all 24+ `xApi` objects (one per backend router: `leadsApi`, `projectsApi`, `tasksApi`, `employeesApi`, `customersApi`, `attendanceApi`, `wfhApi`, `leavesApi`, `openingsApi`, `candidatesApi`, `leavePolicyApi`, `holidaysApi`, `auditLogApi`, `invoicesApi`, `expensesApi`, `payrollApi`, `expenseCategoriesApi`, `crmSourcesApi`, `expenseCategoryBudgetsApi`, `milestonesApi`, `financeStatsApi`, `notificationsApi`, `timeEntriesApi`, `settingsApi`, `preferencesApi`), plus formatting helpers (`money`, `moneyPKR`, `toISO`/`fromISO`, PKT date helpers), the employee-name cache (`setEmployeeCache`/`getEmployeeName`), search/highlight helpers, persona/access helpers (`mergeAccess`, `derivePersonaFlavor`, `deriveLandingFromAccess`), date-range presets, and the deep-link helpers (`deepLinkHref`, `isModifiedClick`, `parseDeepLinkHash`, `clearDeepLinkHash`). Every page imports what it needs from here rather than re-implementing API calls. If you need a new backend call added to a page, check here first — it's very likely the method already exists (e.g. `leadsApi.search(q, limit)` hits the backend's dedicated `/api/leads/search`).

### `src/lib/auth-context.tsx`
`AuthProvider`/`useAuth()`. Login/change-password/logout/session-expiry. Exposes `currentUser`, `mustChangePassword`, `landingScreen`, and the login/change-password form handlers used by `LoginScreen`/`ChangePasswordScreen`. Changing password does **not** sign the user out — the JWT stays valid (the backend never checks the password hash on subsequent requests, only `is_active`/`access_levels`), so a successful change just clears `mustChangePassword` and continues straight into the app.

### `src/lib/app-data-context.tsx`
`AppDataProvider`/`useAppData()` — cross-cutting state needed by the shell itself and by more than one page: `employees`, `leaves`, `allWfhRequests`, `notifications`, and `crmStagesList`/`setCrmStagesList`.

**`crmStagesList` is a deliberate quirk, not an oversight**: CRM pipeline stages have no backend table at all — they're in-memory state (default `["New","Contacted","Proposal","Negotiation","Won","Lost"]`), shared between the CRM screen and Setup → Stages & Sources via this context, and reset to the default on a full page reload. This is intentional (matches the original), not a bug. CRM sources and expense categories, by contrast, **are** real backend-persisted tables (`crmSourcesApi`, `expenseCategoriesApi`) — those don't need this treatment; each page just refetches them on mount.

`reloadLeavesAndWfh` skips fetching entirely for the `devmember` persona (individual-contributor Dev Members don't need company-wide leave data) — **except** when that Dev Member actually has direct reports (checked against `employees`), in which case Manager Hub still needs their real pending count. There's a second effect that re-checks this once `employees` resolves, since the boot effect fires before that fetch lands.

### `src/lib/toast-context.tsx`
`ToastProvider`/`useToast()` — bottom-right toast stack, 3800ms auto-dismiss + 220ms closing animation.

### `src/lib/use-company-data.ts`
Shared hook used by both Dashboard (`app/page.tsx`) and Reports (`app/reports/page.tsx`) to load leads/projects/invoices/expenses/financeStats/categoryBudgets/timeAllocations/openings/currencyRate in one `Promise.all`.

### `src/design-system/healer-bundle.js`
The extracted, de-globalized compiled UI-component bundle (a generic template of which ORBIT only ever used 9 components: `Button`, `Input`, `Select`, `Badge`, `Icon`, `StatCard`, `SidebarSection`, `Modal`, `Avatar`). Byte-preserved from the original compiled output; only mechanically de-globalized. If a component looks/behaves oddly, this file is compiled output, not hand-written source — don't try to "clean it up," just check whether it's actually being invoked with the right props from the calling page.

### `src/components/shell/Shell.tsx`
Sidebar + topbar. Maps nav item ids straight to real routes via `usePathname()`/`useRouter()` (`screenIdToPath`/`pathToScreenId`: `"dashboard" ↔ "/"`, everything else `"id" ↔ "/id"`). Computes Manager Hub visibility/badge count here and gates the "Setup" nav item on `access.permissions`.

**Universal Search** lives here too: a debounced (300ms, 2-char minimum) topbar search that queries `leadsApi.search`, `projectsApi.list({search})`, `tasksApi.list({search})` (matches task **tags**, not just title/description — see the backend's `task_repository.py`), `customersApi.list(search)`, and `employeesApi.list({search})` in parallel, gated by which modules the current user actually has access to. Results are real `<a href>`s built with `deepLinkHref`, so clicking one (or opening it in a new tab) navigates to the owning page and opens the exact item via the same deep-link mechanism described below. Fetched fresh per query rather than kept preloaded — leads/projects/tasks/employees are otherwise only ever loaded by their own page.

### `src/app/*/page.tsx` — one per screen
Each is a single large `"use client"` component owning all of that screen's state, drawers, and modals — no shared per-screen component layer. Each has a top-of-file comment describing what it ports and any intentional deviations.

**Deep-linking**: every lead/project/task/customer/employee card or "View" link is a real `<a href="#/type/id">` (see `deepLinkHref`/`isModifiedClick`/`parseDeepLinkHash`/`clearDeepLinkHash` in `orbit-client.js`), not just a `<div onClick>`. A plain left-click still `preventDefault()`s and opens the drawer in place (via each page's own `handleDeepLinkClick`-style helper); a modified click (ctrl/cmd/shift/middle) lets the browser handle it natively — open in a new tab, which works because there's a real href underneath. A fresh page load re-parses `window.location.hash` on mount and opens straight to the right item; closing a drawer clears the hash again so it doesn't linger in the URL bar or re-open on refresh.

**Drag-and-drop**: CRM's lead Kanban and Dev's Project/Task Kanban boards support native HTML5 drag-and-drop between columns, as an addition to (not a replacement for) the inline status `<select>` — dropping a card just calls the exact same `changeLeadStage`/`changeProjectStatus`/`changeTaskStatus` the dropdown already called, so every existing validation/permission rule (CRM's Won-stage attachment gate, sequential-stage guard, Dev Member scoping) still applies untouched; an invalid drop just snaps back with the same warning toast the dropdown would have shown.

Notable pages:
- **`setup/page.tsx`** — Stages & Sources, Leave & Holidays, Audit Trail, Currency, Employees (owner-only) tabs. **User Management and Permissions tabs are excluded entirely**, matching an explicit "leave disabled, match current UX" decision — don't re-add without asking.
- **`hr/page.tsx`** — candidate resume upload is intentionally a no-op toast ("not yet implemented via API"). **Leave Requests tab (and the Attendance tab's WFH list) are read-only** — no Approve/Reject here anymore; that only happens through the employee's manager via Manager Hub now. The drawer still shows full detail including who approved/rejected and their note, once decided. Creating/editing an employee never auto-ticks an access level on a non-Owner's behalf (picking "Dev Member" as the department used to silently queue up the "dev" access level, which then 403'd on submit since only Owners can assign access levels) — that auto-tick is now Owner-only. Attendance History is a day-stepper (Back/Next through actual calendar days, clamped to the selected month) with a This Month/Last Month toggle, not a flat list of the whole month.
- **`me-leave/page.tsx`** — Request history defaults to the current month and uses a real month picker (`<input type="month">`), not "Last 7/30 days" style presets. The drawer shows who approved/rejected (resolved via `getEmployeeName`) and when, alongside the note/reason.
- **`crm/page.tsx`** — Won/Lost leads drop out of the Kanban board and List view by default (still in the DB, reappear the instant a date filter or the Stage filter is set to Won/Lost) — full history lives in the owner-department-only Past Leads view. Comment reply-threading renders as a flat list rather than depth-indented nesting.
- **`reports/page.tsx`** — "Won & Contracted"/"Expected (Pipeline)" figures scope to Reports' own date-range picker rather than reusing Dashboard's currently-selected range — a documented deviation, not a bug.
- **`finance/page.tsx`** — Invoice PDF generation is real: `GET /api/finance/invoices/{id}/pdf` builds the PDF directly in Python with reportlab (`backend/app/services/invoice_pdf_service.py`) — no Word, no LibreOffice, no external binary, so it works identically on Render as it does locally. (This replaced an earlier Word-template + `docx2pdf`/COM-automation approach that only worked on a Windows machine with MS Word installed and crashed in production.)
- **`dev/page.tsx`** — filters are server-side (every filter change, including each keystroke, re-fetches `/api/projects`/`/api/tasks` with query params) — a deliberate deviation from CRM's client-side filtering. Completed projects drop off the Kanban/List view 20 days after completion (`Project.completed_at`, set server-side on the status transition) — same "still in DB, reappears with a filter, full history in a Past Projects view" pattern as CRM's Won/Lost leads.

## Verification workflow (use this for any new/changed page)

1. `npx tsc --noEmit` from `frontend-next/` — must exit clean, no errors.
2. With the dev server running, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/<route>` — must be `200`.
3. Check the dev server log for runtime/compile errors that a bare 200 status wouldn't catch.
4. For anything touching the backend, `python -m py_compile <file>` on the backend side, and confirm `curl http://localhost:8000/openapi.json` still returns 200 after `uvicorn --reload` picks up the change.

This is a mechanical smoke test (compiles + loads), not a substitute for actually clicking through the feature in a browser for anything visual or interactive (drag-and-drop, search dropdowns, drawers).

## Common TypeScript gotchas already hit

- `orbit-client.js` is untyped — object literals like `DEPT_ACCESS_LEVEL` infer a narrow object type with no index signature. Indexing them with a `string` variable needs a cast: `(DEPT_ACCESS_LEVEL as Record<string, string>)[someString]`.
- `sortLeads(...)` (from the untyped lib) can produce implicit-`any` cascades through chained `.map()`/`.filter()` calls — a single cast at the call site (`(sortLeads(...) as Lead[])`) usually resolves all of them at once.
- `useEffect(load, [])` where `load` is a concise-body arrow returning a promise chain fails with TS2345 (`EffectCallback` can't return a `Promise`). Wrap the arrow body in braces so it returns `void`.
- Fields typed via an index signature (`[key: string]: unknown`) need an explicit cast before rendering as text or comparing as a specific type (e.g. `(currentUser?.role as string)`).

## What's left

- **Deployment**: this repo no longer contains the old bundle, but that doesn't by itself mean this app is live on Vercel/Render — verify actual hosting/deployment status before assuming production is serving this code.
- **Manual click-through verification** of newer features (drag-and-drop feel, search dropdown behavior, deep-link open-in-new-tab) in a real browser — these were verified by reading the code and mechanical smoke tests, not a human clicking through them yet.
