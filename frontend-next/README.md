# ORBIT — Frontend

**Next.js (App Router) + TypeScript.** This is the only frontend in this repo — a from-scratch rebuild of what used to be a single-file HTML SPA bundle (built from `unpacked/template.html` + `unpacked/script.js` via `pack.py` at the repo root). That old bundle has been fully retired and deleted; every screen it had is now a real, routed Next.js page here.

It talks to the same FastAPI backend and database ORBIT has always used — nothing about the backend/database changed to support this rewrite. Nothing here touches Neon/Postgres directly.

## Running it locally

You need the FastAPI backend running too — this app has no backend of its own.

```bash
# Terminal 1 — backend (from repo root)
cd backend
uvicorn app.main:app --reload
# serves http://localhost:8000

# Terminal 2 — this frontend
cd frontend-next
npm run dev
# serves http://localhost:3000
```

Open `http://localhost:3000` and log in with your usual ORBIT credentials.

If the backend runs somewhere other than `http://localhost:8000` (e.g. you're pointing at Render), set `ORBIT_BACKEND_ORIGIN` before starting the dev server:

```bash
ORBIT_BACKEND_ORIGIN=https://your-render-app.onrender.com npm run dev
```

This works because `next.config.ts` proxies `/api/*` to that origin (see the comment in that file) — the API client makes same-origin-relative `/api/...` calls, so without this rewrite every request 404s against Next.js itself instead of reaching FastAPI.

Other commands:
```bash
npm run build   # production build
npm run start   # run a production build locally
npx tsc --noEmit  # type-check only, no build output
```

## Directory structure

```
frontend-next/
├── next.config.ts              # /api/* rewrite proxy to the FastAPI backend
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout: fonts, AuthProvider, ToastProvider, AuthGate
│   │   ├── globals.css          # Design tokens + component CSS
│   │   ├── page.tsx             # Dashboard ("/")
│   │   ├── reports/page.tsx     # Management Reports
│   │   ├── me-leave/, me-attendance/, me-policies/, me-record/   # "Me" module
│   │   ├── manager-leave/page.tsx  # Manager Hub (direct-report leave/WFH + attendance) — approvals happen here now
│   │   ├── crm/page.tsx         # CRM (leads, Kanban/list with drag-and-drop, drawers, Past Leads)
│   │   ├── customers/page.tsx   # Customers
│   │   ├── dev/page.tsx         # Software Dev (Projects + Tasks, Kanban with drag-and-drop, Past Projects)
│   │   ├── finance/page.tsx     # Invoices (real reportlab-generated PDFs), Expenses, Payroll, Milestones
│   │   ├── hr/page.tsx          # HR (Employees, Leave Requests [read-only], Hiring, Leave Count, Attendance)
│   │   └── setup/page.tsx       # Setup (Stages & Sources, Leave & Holidays, Audit Trail, Currency, Employees)
│   ├── components/
│   │   ├── auth/                # LoginScreen, ChangePasswordScreen, AuthGate
│   │   └── shell/                # Shell (sidebar + topbar + Universal Search), ToastContainer
│   ├── design-system/
│   │   └── healer-bundle.js     # The 9 compiled UI components the app actually uses, de-globalized into ES exports
│   └── lib/
│       ├── orbit-client.js      # All API calls + shared formatting/helpers/deep-link utilities
│       ├── auth-context.tsx     # Login/session state
│       ├── app-data-context.tsx # Cross-cutting state shared across pages (employees, leaves, WFH, notifications, CRM stages)
│       ├── toast-context.tsx    # Toast notifications
│       └── use-company-data.ts  # Shared data loader used by Dashboard + Reports
```

Every page under `src/app/*/page.tsx` corresponds to exactly one sidebar nav item / screen. There is no separate "components per screen" layer beyond that — each page file owns its own drawers, modals, and tables (a deliberate decision: some duplication across pages was preserved on purpose rather than factored into shared abstractions — see `CLAUDE.md`).

Highlights beyond the original 1:1 port:
- **Universal Search** in the topbar — searches leads, projects, tasks (including tags), customers, and people, and jumps straight to a result.
- **Drag-and-drop** on the CRM/Projects/Tasks Kanban boards, alongside the existing status dropdown.
- **Deep-linking** — every card/row has a real link, so right-click/ctrl-click/middle-click "open in new tab" works, and closing a drawer cleans the URL back up.
- Leave/WFH approval happens through the employee's manager (Manager Hub) — HR's Leave Requests view is read-only, apart from one designated HR account that can also approve/reject from the request drawer.
- Invoice PDFs are generated directly in Python (no Word/LibreOffice dependency).

For the full file-by-file rationale, known deviations, and TypeScript gotchas, see [CLAUDE.md](./CLAUDE.md).

## What's left

- **Deployment status** — verify where (if anywhere) this is actually hosted before assuming production traffic is hitting this code; this README doesn't track that.
- **Manual click-through verification** of the newer interactive features (drag-and-drop feel, search dropdown, deep-link new-tab behavior) in a real browser.
