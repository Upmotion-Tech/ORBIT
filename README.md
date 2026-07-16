# Orbit CRM — Backend API

FastAPI backend for the Orbit Professional Services OS. CRM Leads module with full CRUD, Kanban-ready stage workflow, file uploads, activity logging, and search.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI (async) |
| ORM | SQLAlchemy 2.x (async) |
| Validation | Pydantic v2 |
| Migrations | Alembic |
| Database | PostgreSQL (production) / SQLite (development) |
| Auth | JWT (future-ready, dependency-injected) |
| Storage | Local filesystem (abstracted for future S3/R2) |

## Quick Start

```bash
cd backend
pip install -r requirements.txt

# Development (SQLite — no config needed)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Production (PostgreSQL)
set DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/orbit
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000** for the frontend and **http://localhost:8000/docs** for Swagger.

## Seed Data

```bash
cd backend
set PYTHONPATH=.
python -m scripts.seed
```

Populates 8 sample leads across all stages (New, Contacted, Proposal, Negotiation, Won, Lost) with activity log entries.

## Project Structure

```
backend/
├── app/
│   ├── main.py                  # FastAPI app entry, CORS, lifespan
│   ├── core/
│   │   ├── config.py            # env-based config (DATABASE_URL detection)
│   │   ├── database.py          # Async engine, session factory, Base
│   │   ├── security.py          # JWT create/decode, password hashing
│   │   └── dependencies.py      # get_db, get_current_user (JWT-ready)
│   ├── models/
│   │   ├── lead.py              # Lead ORM model (soft-delete, indexes)
│   │   └── lead_activity.py     # Activity log model
│   ├── schemas/
│   │   ├── common.py            # Pagination, ErrorResponse, WarningResponse
│   │   ├── lead.py              # LeadCreate, LeadUpdate, LeadStageUpdate, LeadResponse
│   │   └── lead_activity.py     # ActivityCreate, ActivityResponse
│   ├── repositories/
│   │   ├── lead_repository.py   # All DB queries (list, search, filter, duplicates)
│   │   └── activity_repository.py
│   ├── services/
│   │   ├── lead_service.py      # Business logic, stage validation, audit
│   │   └── storage_service.py   # File upload abstraction (local)
│   ├── routers/
│   │   └── leads.py             # All 11 API endpoints
│   ├── storage/                 # Uploaded files (local dev)
│   └── utils/
├── static/
│   └── index.html               # Frontend SPA (served at /)
├── scripts/
│   └── seed.py                  # Database seeder
├── alembic/                     # Migrations
├── alembic.ini
├── requirements.txt
├── .env                         # Local config
└── README.md
```

## API Endpoints

All endpoints are prefixed with `/api/leads`. Full docs at `/docs`.

### Leads CRUD

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/leads` | List leads with search, filter, sort, pagination |
| `GET` | `/api/leads/search?q=` | Global search (company, contact, rep, description) |
| `GET` | `/api/leads/{id}` | Get single lead |
| `POST` | `/api/leads` | Create lead (returns duplicate warning) |
| `PUT` | `/api/leads/{id}` | Update lead |
| `PATCH` | `/api/leads/{id}/stage` | Change stage (validates workflow) |
| `DELETE` | `/api/leads/{id}` | Soft delete |

### File Uploads

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/leads/{id}/scope-document` | Upload scope document |
| `POST` | `/api/leads/{id}/signed-contract` | Upload signed contract |

### Activities

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/leads/{id}/activities` | List activity log |
| `POST` | `/api/leads/{id}/activities` | Add activity/comment |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |

## Lead Stages & Workflow

```
New → Contacted → Proposal → Negotiation → Won
  ↓       ↓           ↓             ↓        Lost
  └───────┴───────────┴─────────────┘
```

- Normal users cannot skip stages (e.g. New → Won is blocked)
- Users with `role: owner` may override stage transitions
- Won/Lost are terminal stages

## Database

### Auto-Switch: SQLite ↔ PostgreSQL

The backend detects the database automatically:

- **`DATABASE_URL` set** → uses PostgreSQL via asyncpg
- **`DATABASE_URL` unset** → uses SQLite via aiosqlite

No code changes required between environments.

### Lead Model

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `company_name` | String(255) | Required, indexed |
| `client_contact_name` | String(255) | Required |
| `assigned_rep` | String(255) | Indexed |
| `source` | String(100) | Indexed |
| `medium` | String(100) | |
| `value` | Float | >= 0 |
| `stage` | String(50) | New/Contacted/Proposal/Negotiation/Won/Lost |
| `description` | Text | |
| `date_received` | Date | |
| `expected_closure_date` | Date | |
| `actual_closure_date` | Date | |
| `follow_up_date` | Date | |
| `scope_document_url` | String(500) | |
| `signed_contract_url` | String(500) | |
| `is_locked_revenue` | Boolean | TRUE only when both documents exist |
| `created_at` | DateTime (tz-aware) | |
| `updated_at` | DateTime (tz-aware) | |
| `created_by` | String(255) | |
| `updated_by` | String(255) | |
| `deleted_at` | DateTime (tz-aware) | Soft delete |

### LeadActivity Model

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID (PK) | Auto-generated |
| `lead_id` | UUID (FK) | Cascade delete |
| `type` | String(50) | create, update, stage_change, file_upload, delete, comment |
| `note` | Text | Free text |
| `created_by` | String(255) | |
| `created_at` | DateTime (tz-aware) | |

## Key Business Rules

- **Duplicate Detection**: On create/update, warns if same company or contact exists (non-blocking)
- **Locked Revenue**: Automatically set to TRUE when both scope document AND signed contract are uploaded
- **Follow-up Overdue**: Computed dynamically — `follow_up_date < today AND stage NOT IN (Won, Lost)`
- **Audit Trail**: Every mutation (create, update, stage change, delete, file upload) creates a LeadActivity entry
- **Soft Delete**: Leads are soft-deleted via `deleted_at` timestamp, excluded from all queries
- **Validation**: Backend validates all fields — never trust frontend input

## Authentication

JWT is dependency-ready. Endpoints accept a Bearer token via the `get_current_user` dependency. Currently defaults to `anonymous` with `owner` role for development.

```python
# Example: Protect an endpoint
async def create_lead(
    data: LeadCreate,
    current_user: dict = Depends(get_current_user),
    service: LeadService = Depends(get_lead_service),
):
```

## Timezone Handling

- All timestamps stored as timezone-aware (UTC) in the database
- Date-only fields (date_received, expected_closure_date, etc.) stored as DATE type
- Frontend converts to local timezone for display — no Z suffix on user-visible dates
- `created_at` and `updated_at` use `DateTime(timezone=True)`

## Deployment

### Frontend (Vercel) + Backend (Render) + Database (Neon)

1. Push backend to Render with `DATABASE_URL` pointing to Neon PostgreSQL
2. The frontend `index.html` is served by the backend itself at `/`
3. For separate deployment, configure the frontend to point to the Render API URL

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | SQLite | PostgreSQL connection string |
| `UPLOAD_DIR` | No | `app/storage` | File upload directory |
| `SECRET_KEY` | No | dev key | JWT signing key |
| `DEBUG` | No | `true` | SQLAlchemy echo |

## What's Implemented

- [x] FastAPI async application with lifespan
- [x] SQLAlchemy 2.x async ORM (Lead + LeadActivity models)
- [x] Pydantic v2 schemas (request validation, response serialization)
- [x] All 11 API endpoints for CRM Leads module
- [x] Stage workflow validation (no skip for normal users)
- [x] Duplicate detection with warning response
- [x] Auto-computed locked revenue (both documents required)
- [x] Dynamic follow-up overdue flag
- [x] File upload with storage abstraction layer
- [x] Activity/audit logging on every mutation
- [x] Soft delete with filtered queries
- [x] Pagination, search, filter, sort on list endpoint
- [x] Global search across company, contact, rep, description
- [x] Auto-switch SQLite (dev) / PostgreSQL (prod) via DATABASE_URL
- [x] JWT-ready dependency injection
- [x] Global error handling with structured JSON
- [x] CORS configured
- [x] Frontend served alongside API on same port
- [x] Seed script with sample data
- [x] Alembic migrations
- [x] Swagger/OpenAPI docs at /docs

## What's Next (Phase 2)

- [ ] Wire the bundled frontend SPA to call this API instead of using in-memory data
- [ ] Map frontend field names to API field names
- [ ] Implement JWT login endpoint
- [ ] Add remaining modules (Dev, Finance, HR, etc.)
