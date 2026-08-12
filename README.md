# ORBIT — Operational Revenue & Business Intelligence Tool

**ORBIT** is the internal ERP / Professional Services Operating System built for **Upmotion Tech**. It replaces spreadsheets and fragmented messaging threads with a single unified system of record for sales pipeline, project delivery, HR, finance, and team administration — with real authentication, fine-grained RBAC permissions, and a shared source of truth.

---

## 🚀 Key Modules & Capabilities

| Module | Features & Scope |
|---|---|
| **CRM** | Sales leads, pipeline stages (New → Contacted → Proposal → Negotiation → Won/Lost) with drag-and-drop between stages, scope documents & signed contract attachments, duplicate lead detection, activity logging, lead comments, and Won/Lost leads archived to a separate Past Leads view. |
| **Software Dev** | Projects (automatically created when CRM lead is marked `Won`) and Tasks/Subtasks, Kanban (drag-and-drop) & list views, team member assignment, time logging, multi-file attachments, threaded comments, and Completed projects archived to a Past Projects view 20 days after completion. |
| **Finance** | Invoices (real PDF generation matching the company's actual letterhead — logo, address, registration/NTN, approval signature & stamp), Expenses (with category & department budget tracking), Payroll / salary slips, Payment milestones, and financial stats overview. |
| **HR** | Employee directory, leave requests & balances (approval happens via the employee's manager, plus one designated HR account who can also approve/reject directly from the HR screen), daily attendance marking (day-by-day history with Back/Next navigation, plus a one-click topbar "Mark Attendance" action), Work From Home (WFH) requests, hiring pipeline (job openings + candidates), and leave policy settings. |
| **Company Policies & AI Assistant** | Owner-published policies (typed text or PDF upload) any employee can read, plus a RAG-style AI assistant (Groq-backed) that answers policy questions grounded in whatever's currently published — no re-indexing step, it re-reads the DB fresh on every question. |
| **My Record** | An employee's own full profile (manager, start date, birthdate, phone, emergency contact, etc.), latest salary slip breakdown, and their own contract file — all strictly read-only. |
| **Dashboard & Reports** | Company-wide revenue/cash-position overview, delayed-project tracking, project profitability, resource utilization, expense category budgets, exportable to Excel/PDF. |
| **Setup** | Exchange rates (USD/PKR), pipeline stages & lead sources, leave policy settings, audit trail, employee management & role configuration. |
| **Universal Search** | Topbar search across leads, projects, tasks (including tags), customers, and people — click a result to jump straight to it. |
| **Auth & Permissions** | Real JWT authentication, bcrypt password hashing, per-employee multi-select access levels (`owner`, `dashboard`, `crm`, `dev`, `finance`, `hr`, `permissions`, `customers`, `employee`), mandatory password change on initial login / admin reset (no forced re-login afterward), instant account deactivation, dynamic role updates, and a route-level access guard (not just a hidden sidebar link) so a user can never land on a screen their access levels don't cover. |
| **Notifications & Audit Trail** | Targeted, deep-linking notifications (clicking one jumps straight to the actual task/project/lead/leave/WFH request; a leave/WFH request notifies the employee's actual manager, not every Owner/HR person), notifications auto-clear after 24h, and comprehensive real-time audit logging for sensitive actions across all modules. |

---

## 💰 How Payroll Tax Works (Plain-Language Guide)

This section is written for anyone using ORBIT day-to-day — no technical background needed.

**What are Tax Slabs?** Pakistan's income tax uses a bracket system: as your income goes up, only the portion *above* each threshold is taxed at that bracket's higher rate — never your whole salary at one flat rate. An Owner enters the official government brackets once, under **Setup → Tax Slabs** (e.g. "0% up to Rs. 600,000", "1% on the amount above Rs. 600,000 up to Rs. 1,200,000", and so on), and every employee's salary slip is calculated against them automatically every month.

**How long do tax slabs stay in effect?** Indefinitely, exactly as entered, until someone with Owner access manually changes or deletes them — there's no yearly expiry and nothing resets on its own. When the government publishes new brackets for a new tax year, an Owner just updates the numbers on that same Setup page.

**Does changing tax slabs affect past salary slips?** No. A change only affects the current month and any month after it. Every past month's salary slip stays exactly as it was actually calculated and paid at the time — editing this year's brackets can never quietly rewrite what someone was paid last year.

**The Salary Slip document**: every employee's downloadable Salary Slip PDF matches Upmotion Tech's official salary slip format — same layout, company logo and address, the Partner's signature and stamp — with Basic Pay, Incentive Pay, House Rent Allowance, Income Tax, and Net Pay each broken out clearly, plus the net amount spelled out in words.

---

## 🛠️ Tech Stack & Deployment

| Layer | Technology |
|---|---|
| **Backend Framework** | FastAPI (Python 3.11+, Async) |
| **ORM** | SQLAlchemy 2.x (Async) |
| **Data Validation** | Pydantic v2 |
| **Production Database** | Neon PostgreSQL (`postgresql+asyncpg://`) |
| **Development Database** | SQLite (`sqlite+aiosqlite:///./orbit.db`, zero-config local fallback) |
| **Auth / Security** | JWT (`python-jose`) + `bcrypt` password hashing (off the event loop via `asyncio.to_thread`) |
| **Document Generation** | ReportLab — invoice PDFs and dashboard exports are both generated directly in Python, no external binary (Word, LibreOffice, etc.) required |
| **AI Assistant** | Groq (OpenAI-compatible chat completions API) powers the Company Policies RAG assistant |
| **File Storage** | Every upload (policy PDFs, lead documents, project attachments, employee contracts) is stored as bytes directly in Postgres, not local disk — Render's filesystem is ephemeral and wipes on redeploy |
| **Timezone Standard** | Pakistan Standard Time (PKT, `Asia/Karachi`, fixed UTC+05:00, no DST) |
| **Backend Hosting** | **Render** |
| **Frontend Hosting** | **Vercel** |
| **Frontend Architecture** | Next.js (App Router) + TypeScript — real routing, one route per screen, with a first responsive/mobile pass on the core layout |

---

## 📂 Project Architecture

```
Orbit/
├── CLAUDE.md                # Authoritative developer & AI agent build reference
├── README.md                 # Project documentation
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI entry point, middleware, router mounts, DB lifespan
│   │   ├── core/           # Config, DB session, security, PKT time helpers, permission dependencies
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic v2 request/response models
│   │   ├── repositories/   # DB query abstraction layer
│   │   ├── services/       # Core business logic & permission checks
│   │   ├── routers/        # Thin FastAPI HTTP route handlers
│   │   └── storage/        # Legacy local upload directory (uploads now live in Postgres, see below)
│   └── scripts/            # Database seed scripts
└── frontend-next/          # The frontend — Next.js (App Router) + TypeScript
```

See [`frontend-next/README.md`](frontend-next/README.md) to run the frontend locally, or [`frontend-next/CLAUDE.md`](frontend-next/CLAUDE.md) for the full technical breakdown (what's where, known intentional deviations, etc.).

---

## 💻 Local Development Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

- **API URL**: `http://localhost:8000`
- **Interactive API Documentation (Swagger)**: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend-next
npm install
npm run dev
```

- **App URL**: `http://localhost:3000` — proxies `/api/*` to the backend (see `frontend-next/next.config.ts`; set `ORBIT_BACKEND_ORIGIN` if the backend isn't on `localhost:8000`).

---

## 🔒 Security & Access Control Highlights

- **Dynamic Role Refresh**: User access levels (`access_levels`) are re-validated from the database on every authenticated API call, allowing permission updates to take effect instantly without forcing users to re-login.
- **Route-Level Access Guard**: the frontend actively redirects a user away from any screen their access levels don't cover, rather than relying solely on the sidebar hiding a link to it.
- **Dev Member Project & Task Isolation**: Engineers in the `Dev Member` department only see projects to which they are explicitly assigned (`team_ids`) and associated tasks.
- **Authenticated File Access**: every uploaded file (contracts, policy PDFs, lead documents, project attachments) is served through an authenticated endpoint, not a public static URL — viewing one requires a valid session token.
- **Safe Account Deletion**: Hard deletion of an employee account automatically unlinks/cleans up associated records across attendance, WFH requests, audit logs, comments, and tasks cleanly.
- **PKT Time Standardization**: Timestamps across all endpoints and UI views use Pakistan Standard Time (`Asia/Karachi`, UTC+05:00) consistently.
