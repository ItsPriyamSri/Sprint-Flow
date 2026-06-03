# SprintFlow

> Upload your Excel workbook. Get a live Scrum planning dashboard — instantly.

SprintFlow converts an existing Excel-based task workflow (e.g. CARR Master Task List) into a project-scoped Scrum platform: **Overview**, **Sprint boards**, **My Work**, **Team capacity**, **Backlog**, and a **Flow** Kanban view. Upload the workbook you already use; within a minute tasks appear on the dashboard and board with sprints, epics, and hour assignments tied to your active project.

---

## Quick Start (local development)

### Prerequisites

- **Node.js 20+**
- **pnpm 9+** — `npm install -g pnpm@9`
- **Docker Desktop** (for Postgres)

### 1 — Install dependencies

```bash
pnpm install
```

### 2 — Environment variables

```bash
cp .env.example .env
# Edit .env and fill in your values (see Production section for required vars)
```

### 3 — Start Postgres

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4 — Apply migrations and seed

```bash
pnpm db:migrate          # creates all tables
pnpm db:seed             # seeds admin + default workspace + board
```

Default admin credentials after seeding:

| Field    | Value                        |
|----------|------------------------------|
| Email    | `admin@sprintflow.local`     |
| Password | `Admin1234!`                 |

### 5 — Start the services

Open two terminals:

```bash
# Terminal 1 — API on http://localhost:3001
pnpm --filter @sprintflow/api dev

# Terminal 2 — Web on http://localhost:3002
pnpm --filter @sprintflow/web dev

# Or both from repo root:
pnpm dev
```

Health check: `GET http://localhost:3001/api/v1/health` → `{"status":"ok","db":"ok"}`

Ensure `CORS_ORIGIN` in `.env` matches the web port (default `http://localhost:3002`).

---

## Using the Application

1. Open `http://localhost:3002` → redirected to `/login`
2. Sign in as `admin@sprintflow.local` / `Admin1234!`
3. Land on **Overview** for the active project (sidebar: sprints, My Work, Team, Backlog, Flow, Import)
4. **Import workbook** (sidebar or `/import`) → upload your `.xlsx` file
5. Map columns → preview (confirm **Importing into: &lt;project&gt;**)
6. Commit → **View project overview** — sprint health, capacity, and task counts update
7. Open sprints from the sidebar for the epic-grouped sprint board; use **Flow** (`/board`) for Kanban drag-and-drop
8. **My Work** — admin (`User.role = ADMIN`) sees all team members' tasks grouped by person under "Team Work"; regular members see only their own assignments

**Re-import:** Committing the same workbook again upserts tasks by `externalId` and re-links sprints/epics to the active project. Use this after upgrades if older imports only appeared on Flow.

**Note:** Imports bind to the **active project** (or the workspace’s first project). Tasks without project/sprint linkage appear on Flow but not on Overview — re-import to repair.

---

## Production Deployment (Docker Compose)

### 1 — Set strong secrets

Copy `.env.example` to `.env` and replace every placeholder:

```bash
# Generate strong secrets (Linux/macOS):
openssl rand -hex 32   # use one value for JWT_ACCESS_SECRET
openssl rand -hex 32   # use a different value for JWT_REFRESH_SECRET
```

**Required vars (no defaults allowed in production):**

| Variable              | Description                            |
|-----------------------|----------------------------------------|
| `DATABASE_URL`        | PostgreSQL connection string           |
| `JWT_ACCESS_SECRET`   | ≥32 random chars — never reuse        |
| `JWT_REFRESH_SECRET`  | ≥32 random chars — different from above |
| `CORS_ORIGIN`         | Exact frontend origin (e.g. `https://sprintflow.company.com`) — never `*` |
| `SEED_ADMIN_EMAIL`    | Initial admin login                    |
| `SEED_ADMIN_PASSWORD` | Strong password                        |

The API will **refuse to start** if it detects dev-placeholder secrets in `NODE_ENV=production`.

### 2 — Build and start

```bash
docker compose up --build -d
```

This starts three containers:
- `postgres` — PostgreSQL 16
- `api` — Express REST API (port 3001); runs `prisma migrate deploy` then starts
- `web` — Next.js 15 standalone server (port 3000 in Docker; dev uses 3002)

### 3 — Smoke test

```bash
# All containers healthy?
docker compose ps

# API responding?
curl http://localhost:3001/api/v1/health
# Expected: {"status":"ok","db":"ok","timestamp":"..."}

# Web responding?
curl -I http://localhost:3000   # production Docker
# Expected: HTTP/1.1 200 OK
```

---

## Operations Runbook

### Reset and re-seed the database

```bash
# Drop all tables and re-apply migrations (DESTRUCTIVE — loses all data)
docker compose exec api sh -c "cd /app && pnpm --filter @sprintflow/db exec prisma migrate reset --force"
```

### Apply new migrations after an upgrade

```bash
# Pull new code, rebuild, and let the API entrypoint run migrations
docker compose up --build -d
```

The API container entrypoint runs `prisma migrate deploy` automatically on every start before opening the port.

### Roll back a bad import

If you imported the wrong workbook, use the rollback endpoint to remove all tasks from that import without touching manually created tasks:

```bash
# 1. Find the import ID from the UI or via the API
curl -H "Authorization: Bearer <token>" \
     "http://localhost:3001/api/v1/imports/<importId>/preview?workspaceId=<workspaceId>"

# 2. Roll back
curl -X POST \
     -H "Authorization: Bearer <token>" \
     "http://localhost:3001/api/v1/imports/<importId>/rollback?workspaceId=<workspaceId>"
```

### Rotate JWT secrets

1. Update `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env`
2. Restart the API — all existing tokens are immediately invalid (users must re-login)
3. Purge the `RefreshToken` table manually if needed: `DELETE FROM "RefreshToken";`

### Increase file upload limit

Default: 20 MB. To increase, set `STORAGE_MAX_FILE_SIZE_MB=50` in `.env` and update `multer`'s `limits.fileSize` in `apps/api/src/modules/import/import.routes.ts`.

### Swap local file storage for S3

1. Implement the `StorageDriver` interface in `apps/api/src/lib/storage.ts`
2. Set `STORAGE_DRIVER=s3` and add S3 env vars
3. The import pipeline uses `storage.store()` / `storage.read()` — no other changes needed

---

## Monorepo Structure

```
apps/
  api/          Express REST API — all endpoints under /api/v1/
  web/          Next.js 15 App Router — (app) shell: overview, sprints, import, flow board
packages/
  db/           Prisma schema + migrations + generated client + seed
  shared/       Zod schemas + TypeScript types (web ↔ api contract)
  ui/           Shared Tailwind React components (Button, Badge, Spinner)
docker/
  Dockerfile.api          Production multi-stage build
  Dockerfile.web          Production standalone Next.js build
  docker-entrypoint.sh    Runs migrations then starts server
docker-compose.yml        Full stack (prod)
docker-compose.dev.yml    Dev (Postgres only)
```

> `PROGRESS.md` and `AI_ROADMAP.md` are excluded from git (see `.gitignore`) and exist only in the local working tree for reference.

---

## Development Notes

### Typecheck

```bash
pnpm --filter @sprintflow/api typecheck
pnpm --filter @sprintflow/web typecheck
```

### Prisma studio (browse DB visually)

```bash
pnpm --filter @sprintflow/db studio
```

### Generate Prisma client after schema changes

```bash
pnpm db:generate
pnpm db:migrate   # creates + applies new migration in dev
```

### Adding a new migration

```bash
cd packages/db
pnpm exec prisma migrate dev --name describe_the_change
```

---

## Import Pipeline (how it works)

1. **Upload** — validates magic bytes (XLSX/XLS), size limit, stores file
2. **Detect** — finds "Master Task List" sheet by fuzzy name match; detects header row dynamically (no hardcoded row numbers)
3. **Normalize** — maps each cell to its field; reads cell `.w` (Excel formatted text) to preserve decimal IDs like `0.7`, `13.5`, `22.3` exactly as strings
4. **Validate** — per-row status: VALID / WARNING / ERROR / SKIPPED; unknown statuses/priorities get safe defaults
5. **Preview** — user reviews all rows before committing; can remap columns
6. **Commit** — transactional: resolves **projectId** (required), adopts workspace sprints by name, sets `projectId` on sprints/epics/tasks, creates `TaskAssignment` rows from hour columns when project members match
7. **Rollback** — reverses a committed import (removes tasks created by that import)

Imported data is visible on **Overview** and project views when tasks use sprints belonging to that project (not only on the Flow board).

---

## Architecture

```
Browser (Next.js)  →  Express API (/api/v1/*)  →  PostgreSQL (Prisma)
                                               →  Local FS (uploads)
```

- JWT access tokens (15 min) + rotating refresh tokens (7 days, httpOnly cookie)
- Role-based access: Global (`ADMIN` / `MEMBER`) + per-Workspace (`OWNER` / `ADMIN` / `MEMBER` / `VIEWER`)
- **My Work** is role-aware: `ADMIN` users receive `allMembersWork[]` (all team members' sprint tasks grouped by person); regular members receive only their own `TaskAssignment` rows
- All task mutations recorded in `ActivityLog` (audit trail)
- Fractional float positions for O(1) card reorder without renumbering

`PROGRESS.md` (local-only, gitignored) contains the full build history and phase-by-phase change log.
