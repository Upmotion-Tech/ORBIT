# migrate.md — Deployment, Environment & Migration Guide for ORBIT

Written so a new agent (or a human) picking up this project can deploy a
change or run a database migration correctly on the first try, without
having to rediscover any of this from scratch. Read this before touching
production — either the live Neon database or a live Render/Vercel deploy.

See also: root `CLAUDE.md` for architecture/RBAC/general conventions,
`frontend-next/CLAUDE.md` for frontend specifics, `backend/.env.example`
for the full list of backend environment variables.

---

## 1. The stack, where each piece actually lives

| Piece | Where | Repo path |
|---|---|---|
| Backend API (FastAPI) | **Render** | `backend/` |
| Database | **Neon** (managed Postgres) | n/a — external, connected via `DATABASE_URL` |
| Frontend (Next.js) | **Vercel** | `frontend-next/` |

Local dev never touches Neon by default — `DATABASE_URL` unset means the
backend falls back to a local SQLite file (`backend/orbit.db`), created
automatically. You only point at Neon when you deliberately set
`DATABASE_URL` (see §3).

---

## 2. Environment variables — what goes where

### Backend (Render)

Every variable the backend reads is declared in `backend/app/core/config.py`
(`Settings` class) and documented with placeholders in
**`backend/.env.example`** — copy that file to `backend/.env` for local dev
(gitignored, never commit it), and set the same variable *names* in Render's
dashboard (**Service → Environment**) for production, with real values.

The two that most need attention when setting up a fresh Render deploy:

- **`DATABASE_URL`** — the Neon connection string, pasted as-is (see §3.1
  for the exact string format and why no manual editing is needed).
- **`SECRET_KEY`** — must be a real random value in production, **not** the
  `dev-secret-key-change-in-production` placeholder. Generate one with:
  ```
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
  Changing this later invalidates every currently-issued JWT (forces
  everyone to log back in) — don't rotate it in production casually.
- **`DEBUG`** — must be `false` in production. Left `true` (the local
  default), the global exception handler in `main.py` echoes the raw
  exception string in every 500 response body.

Everything else (`GROQ_API`, `SMTP_*`, `ORBIT_LOGIN_URL`) degrades
gracefully when unset — the relevant feature no-ops or shows a clean "not
configured" message rather than crashing (see `.env.example`'s comments for
which).

Render's **Root Directory** must be `backend`. There's no `Procfile`/
`render.yaml` in this repo — the start command is configured directly in
Render's dashboard; it should run:
```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```
Dependencies come from `backend/requirements.txt` (Render auto-detects
Python from its presence).

Render's **free tier spins down after ~15 minutes of inactivity** — the
first request after a spin-down pays a real cold-start delay. This is
normal, not a bug; don't chase it as one.

### Frontend (Vercel)

- **`ORBIT_BACKEND_ORIGIN`** — must be set to the Render backend's public
  URL in production (e.g. `https://your-service.onrender.com`). Read by
  `next.config.ts`'s `rewrites()`, which proxies every `/api/*` call from
  the frontend to this origin. Unset, it defaults to `http://localhost:8000`
  — correct for local dev, silently wrong (every API call 404s) if left
  unset on Vercel.
- **Root Directory** must be `frontend-next`.
- **"Automatically expose System Environment Variables"** (Vercel project
  → Settings → Environment Variables) should be **on**. `next.config.ts`
  reads `VERCEL_DEPLOYMENT_ID`/`VERCEL_GIT_COMMIT_SHA` from this to set
  Next's `deploymentId` config (version-skew protection — see §4). Off,
  that feature is silently inactive; nothing breaks, it's just not helping.
- **Skew Protection** (Vercel project → Settings → General/Advanced,
  **Pro-plan feature** — check availability on your plan) — recommended on
  top of the above. It keeps an already-open tab served by its *original*
  deployment's assets during a rolling deploy, instead of relying on the
  `deploymentId` fallback (which self-heals via a reload, but doesn't
  prevent the interruption in the first place).

No `frontend-next/.env` is needed for a normal deploy — Vercel's dashboard
env vars cover it. `frontend-next/.gitignore` uses a `.env*` pattern, so if
you ever do add a `frontend-next/.env.example`, that gitignore rule needs a
`!.env.example` exception added or it'll silently never get committed.

---

## 3. Database migrations

### 3.0 — Back up before anything that isn't purely additive

Neon keeps continuous history by default, so point-in-time restore exists
out of the box — but the retention window depends on the plan, and isn't
something to rely on for a deliberate "before I touch prod" safety net.
Check the actual retention on the current plan at Neon console → project →
**Backups/Restore**.

Before running any migration that isn't simply "add a new nullable
column" (i.e. anything that drops/renames/rewrites data, or a SQLite-style
table-rebuild), create a **Neon branch** first — an instant copy-on-write
snapshot of the database at that exact moment. Run the migration against
the main branch as normal; keep the branch around until you're confident
the result is correct, then delete it. This is a stronger guarantee than
"the retention window probably still covers this" and costs nothing to set
up.

A purely additive change (new nullable column, new table) doesn't strictly
need this — there's nothing to lose, since existing rows are untouched and
the column just starts NULL. Verify such a migration succeeded with the
read-only inspection snippet in §3.5 rather than assuming from the
script's own "[OK]" output alone.

### 3.1 — The Neon connection string needs zero manual editing

Neon's dashboard gives you something like:
```
postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.c-2.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```
Paste that directly into `DATABASE_URL` (locally or on Render) — no manual
rewriting needed. `Settings.db_url` (`backend/app/core/config.py`) already:
- rewrites `postgresql://` → `postgresql+asyncpg://` (asyncpg is the async
  driver SQLAlchemy uses here),
- strips `sslmode`/`channel_binding` from the query string (asyncpg doesn't
  accept them as connection kwargs the way psycopg2 does).

### 3.2 — What `create_all` does and does NOT do

`backend/app/main.py`'s `lifespan()` runs `Base.metadata.create_all` on
**every startup**. This creates tables that don't exist yet. **It never
alters an existing table** — no new columns, no dropped constraints, no
renamed anything. If a model changes in a way that isn't "add a brand new
table," a migration script is required, or **production will throw
`UndefinedColumn`/`IntegrityError` the moment the new code runs a query
that assumes the change is already there.**

### 3.3 — Alembic exists in this repo but is NOT used — ignore it

`backend/alembic.ini` and `backend/alembic/` exist, and `alembic` is even
listed in `requirements.txt`. Despite that, **`alembic/versions/` is empty
— zero real revisions have ever been created**, and `alembic.ini`'s
`sqlalchemy.url` is hardcoded to local SQLite, not Neon. It was scaffolded
early in the project and abandoned in favor of the pattern below. Don't try
to `alembic revision`/`alembic upgrade` anything — it isn't wired to
anything real and won't do what you expect.

### 3.4 — The actual migration pattern: one-off scripts in `backend/scripts/`

Every real schema change so far is a small, standalone, **idempotent**
script in `backend/scripts/`, named `migrate_<what_it_does>.py`. Each one:
- checks whether its change is already applied (inspects the live schema
  via SQLAlchemy's `inspect()`) and prints `[OK] ... already exists/gone -
  nothing to do.` and returns early if so — **safe to run more than once,
  including accidentally**,
- makes one targeted `ALTER TABLE` (or, for SQLite specifically — which has
  no `DROP CONSTRAINT`/`DROP COLUMN` in older versions — rebuilds the table:
  create the new shape, copy every row, drop the old table, rename),
- is run with: `python -m scripts.<script_name>` **from the `backend/`
  directory**, with `DATABASE_URL` pointed at whichever database you mean
  to change.

Existing migrations, in case you need to confirm one's already applied to a
given database (or just want the history) — all idempotent, so if unsure,
just run it again:

| Script | What it adds/changes |
|---|---|
| `migrate_attendance_leave_column.py` | `attendance_records.leave_request_id` (nullable FK → `leave_requests.id`) |
| `migrate_employee_cnic.py` | `employees.cnic` (nullable, `"XXXXX-XXXXXXX-X"` format) |
| `migrate_holiday_end_date.py` | `holidays.end_date` (nullable — null = single-day holiday) |
| `migrate_salary_slip_tax_is_manual.py` | `salary_slips.tax_is_manual` (boolean, default false) |
| `migrate_wfh_end_date.py` | `wfh_requests.end_date` (nullable — null = single-day WFH request) |
| `migrate_wfh_drop_unique.py` | Drops `wfh_requests`' `(employee_id, date)` unique constraint (it made a **rejected** request permanently block re-applying for the same date) |

### 3.5 — How to actually run one against production (Neon)

From `backend/`, as a **one-shot environment variable** for that single
command — never write the real Neon URL into a committed file, and never
leave it sitting in your permanent shell environment longer than needed:

**PowerShell:**
```powershell
cd backend
$env:DATABASE_URL = "postgresql://neondb_owner:REAL_PASSWORD@...neon.tech/neondb?sslmode=require&channel_binding=require"
python -m scripts.migrate_wfh_end_date
$env:DATABASE_URL = $null
```

**Bash:**
```bash
cd backend
DATABASE_URL="postgresql://neondb_owner:REAL_PASSWORD@...neon.tech/neondb?sslmode=require&channel_binding=require" \
  python -m scripts.migrate_wfh_end_date
```

If you ever need to *verify* a production schema change actually landed
(rather than trust the script's own "[OK]" output), a read-only check
using the same `DATABASE_URL` — this queries schema metadata only, no rows
are read or changed:
```python
from sqlalchemy import inspect
from app.core.database import engine

async def check():
    async with engine.begin() as conn:
        cols = await conn.run_sync(lambda c: [x["name"] for x in inspect(c).get_columns("wfh_requests")])
        print(cols)
```

### 3.6 — Deploy order: **always migrate before you push**

`create_all` only creates missing tables and never touches existing ones
(§3.2), so the safe sequence is:

1. **Run any new migration script(s) against Neon first**, using the steps
   above.
2. **Then** push the code that depends on the new schema, and let
   Render/Vercel redeploy.

This order is safe specifically because the migrations in this project are
designed to be backward-compatible with the code *currently* running in
production — old code + new schema is fine (the old code just never
references the new column/never hits the dropped constraint), but new code
+ old schema is broken (missing column/constraint errors on the very first
request that touches it). Reversing the order guarantees a broken window
between deploy and migration; doing it in this order never has one.

### 3.7 — Writing a new migration script

Copy the closest existing script as a template (`migrate_holiday_end_date.py`
is the simplest single-nullable-column example; `migrate_wfh_drop_unique.py`
is the example for something SQLite can't do with a plain `ALTER TABLE`).
Keep the same shape: check-first idempotency, a docstring explaining *why*
the change is needed (not just what it does), and the
`python -m scripts.<name>` run convention.

---

## 4. Why `next.config.ts` has a `deploymentId`

Worth knowing before "fixing" it away: without a `deploymentId`, a browser
tab that was loaded before a deploy keeps running that old build's JS. Its
client-side router then asks the server for route data using an identifier
tied to the *old* build. Next.js detects the mismatch and forces a full
page reload to recover — self-healing, but it means an in-progress
click/navigation can occasionally land mid-reload and appear to do nothing
until the reload finishes. Setting `deploymentId` (via the Vercel system
env vars, §2) makes this detection explicit and consistent; Vercel's
**Skew Protection** (§2, Pro-plan) is the complementary fix that avoids the
interruption happening at all, by keeping old tabs served from their
original deployment instead of relying on the reload.
