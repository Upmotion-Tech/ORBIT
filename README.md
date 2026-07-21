# ORBIT — Operational Revenue & Business Intelligence Tool

**ORBIT** is the internal ERP / Professional Services Operating System built for **Upmotion Tech**. It replaces spreadsheets and fragmented messaging threads with a single unified system of record for sales pipeline, project delivery, HR, finance, and team administration — with real authentication, fine-grained RBAC permissions, and a shared source of truth.

---

## 🚀 Key Modules & Capabilities

| Module | Features & Scope |
|---|---|
| **CRM** | Sales leads, pipeline stages (New → Contacted → Proposal → Negotiation → Won/Lost), scope documents & signed contract attachments, duplicate lead detection, activity logging, and lead comments. |
| **Software Dev** | Projects (automatically created when CRM lead is marked `Won`) and Tasks/Subtasks, Kanban & list views, team member assignment, time logging, multi-file attachments, and threaded comments. |
| **Finance** | Invoices (with automated Word-template-driven PDF generation), Expenses (with category & department budget tracking), Payroll / salary slips, Payment milestones, and financial stats overview. |
| **HR** | Employee directory, leave requests & balances, daily attendance marking, Work From Home (WFH) requests, hiring pipeline (job openings + candidates), company holidays, and leave policy settings. |
| **Dashboard & Reports** | Company-wide revenue/cash-position overview, delayed-project tracking, project profitability, resource utilization, expense category budgets, exportable to Excel/PDF. |
| **Setup** | Exchange rates (USD/PKR), pipeline stages & lead sources, leave policy settings, audit trail, employee management & role configuration. |
| **Auth & Permissions** | Real JWT authentication, bcrypt password hashing, per-employee multi-select access levels (`owner`, `dashboard`, `crm`, `dev`, `finance`, `hr`, `permissions`, `customers`, `employee`), mandatory password change on initial login / admin reset, instant account deactivation, and dynamic role updates. |
| **Notifications & Audit Trail** | Scoped notification tray for assignment/approval events, and comprehensive real-time audit logging for sensitive actions across all modules. |

---

## 🛠️ Tech Stack & Deployment

| Layer | Technology |
|---|---|
| **Backend Framework** | FastAPI (Python 3.11+, Async) |
| **ORM** | SQLAlchemy 2.x (Async) |
| **Data Validation** | Pydantic v2 |
| **Production Database** | Neon PostgreSQL (`postgresql+asyncpg://`) |
| **Development Database** | SQLite (`sqlite+aiosqlite:///./orbit.db`, zero-config local fallback) |
| **Auth / Security** | JWT (`python-jose`) + `bcrypt` password hashing |
| **Document Generation** | `python-docx` + ReportLab (Invoice PDF generation) |
| **Timezone Standard** | Pakistan Standard Time (PKT, `Asia/Karachi`, fixed UTC+05:00, no DST) |
| **Backend Hosting** | **Render** |
| **Frontend Hosting** | **Vercel** (static bundle with `/api/*` rewrite proxy to Render) |
| **Frontend Architecture** | Single-file SPA bundle (`ORBIT.html`) compiled from `unpacked/template.html` & `unpacked/script.js` |

---

## 📂 Project Architecture

```
Orbit/
├── ORBIT.html              # Primary production SPA bundle copy
├── CLAUDE.md                # Authoritative developer & AI agent build reference
├── README.md                 # Project documentation
├── pack.py                 # Repackages unpacked/ source files into bundle copies
├── unpacked/               # EDITABLE FRONTEND SOURCE CODE
│   ├── template.html       # Single-file HTML layout & design system
│   ├── script.js           # Single-file JS logic & state management
│   └── sync_script.py      # Injects script.js into template.html
├── backend/
│   ├── app/
│   │   ├── main.py         # FastAPI entry point, middleware, router mounts, DB lifespan
│   │   ├── core/           # Config, DB session, security, PKT time helpers, permission dependencies
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── schemas/        # Pydantic v2 request/response models
│   │   ├── repositories/   # DB query abstraction layer
│   │   ├── services/       # Core business logic & permission checks
│   │   ├── routers/        # Thin FastAPI HTTP route handlers
│   │   ├── templates/      # Invoice DOCX templates for PDF generation
│   │   └── storage/        # Local physical upload directory
│   ├── static/index.html   # Bundle copy served by FastAPI at "/"
│   └── scripts/            # Database seed scripts
└── frontend/
    ├── index.html          # Bundle copy deployed to Vercel
    └── vercel.json         # Vercel proxy configuration
```

---

## 💻 Local Development Setup

### 1. Backend Setup & Run

```bash
# Navigate to backend directory
cd backend

# Install Python dependencies
pip install -r requirements.txt

# Start local dev server (defaults to SQLite database)
uvicorn app.main:app --reload
```

- **Application URL**: `http://localhost:8000`
- **Interactive API Documentation (Swagger)**: `http://localhost:8000/docs`

### 2. Frontend Editing Workflow

When modifying the frontend user interface or logic:

1. Make edits to `unpacked/script.js` or `unpacked/template.html`.
2. Test JavaScript syntax:
   ```bash
   node --check unpacked/script.js
   ```
3. Sync script into template:
   ```bash
   python unpacked/sync_script.py
   ```
4. Build bundle copies:
   ```bash
   python pack.py
   ```
   *(This safely syncs `ORBIT.html`, `backend/static/index.html`, and `frontend/index.html` together).*

---

## 🔒 Security & Access Control Highlights

- **Dynamic Role Refresh**: User access levels (`access_levels`) are re-validated from the database on every authenticated API call, allowing permission updates to take effect instantly without forcing users to re-login.
- **Dev Member Project & Task Isolation**: Engineers in the `Dev Member` department only see projects to which they are explicitly assigned (`team_ids`) and associated tasks.
- **Safe Account Deletion**: Hard deletion of an employee account automatically unlinks/cleans up associated records across attendance, WFH requests, audit logs, comments, and tasks cleanly.
- **PKT Time Standardization**: Timestamps across all endpoints and UI views use Pakistan Standard Time (`Asia/Karachi`, UTC+05:00) consistently.
