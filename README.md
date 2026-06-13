# SprintFlow

> Upload your Excel workbook. Get a live Scrum planning dashboard — instantly.

SprintFlow converts an existing Excel-based task workflow (e.g. CARR Master Task List) into a project-scoped Scrum platform: **Overview**, **Sprint boards**, **My Work**, **Team capacity**, **Backlog**, and a **Flow** Kanban view. Upload the workbook you already use; within a minute tasks appear on the dashboard and board with sprints, epics, and hour assignments tied to your active project.

---

## Run locally

**Prerequisites:** Node.js 20+, pnpm 9+, Docker (Postgres)

```bash
pnpm install
cp .env.example .env          # first time only — defaults work for local dev
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate && pnpm db:seed
pnpm dev
```

| Service | URL |
|---------|-----|
| **Web app** | http://localhost:3002 |
| **API** | http://localhost:3001 |
| **Health check** | http://localhost:3001/api/v1/health → `{"status":"ok","db":"ok"}` |

**Login (after seed):** `admin@sprintflow.local` / `Admin1234!` (Super Admin)

`pnpm dev` starts both API and web via Turbo. To run one service only:

```bash
pnpm --filter @sprintflow/api dev   # API on :3001
pnpm --filter @sprintflow/web dev   # Web on :3002
```

**Database:** Postgres runs in Docker on host port **5433** (`postgresql://sprintflow:sprintflow@localhost:5433/sprintflow`). Connection string is in `.env.example`.

**Stop Postgres:** `docker compose -f docker-compose.dev.yml down`

---

## Using the app

1. Open http://localhost:3002 → sign in
2. Land on **Overview** — sprint health, capacity, task counts
3. **Import** (sidebar or `/import`) → upload `.xlsx` → map columns → commit
4. Open **Sprints** for the epic-grouped board; **Flow** (`/board`) for Kanban drag-and-drop
5. **My Work** — admins see all members' tasks; members see their own assignments

**Re-import:** Same workbook upserts by `externalId` and re-links sprints/epics to the active project.

**Note:** Imports bind to the **active project**. Tasks without sprint linkage appear on Flow but not Overview — re-import to repair.

---

## Production (Docker Compose)

```bash
cp .env.example .env
# Set strong secrets — API refuses dev placeholders in NODE_ENV=production
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET

docker compose up --build -d
```

Web on port **3000** in production Docker (dev uses **3002**). Required env vars: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.

Smoke test: `curl http://localhost:3001/api/v1/health`

---

## Other commands (when needed)

| Task | Command |
|------|---------|
| Typecheck | `pnpm typecheck` |
| Prisma Studio (browse DB) | `pnpm --filter @sprintflow/db studio` |
| Regenerate client after schema change | `pnpm db:generate` |
| New migration (dev) | `cd packages/db && pnpm exec prisma migrate dev --name describe_change` |
| Reset DB (destructive) | `pnpm --filter @sprintflow/db exec prisma migrate reset --force` |
| Format | `pnpm format` |

---

## Operations runbook

### Apply migrations after upgrade

```bash
docker compose up --build -d
```

API entrypoint runs `prisma migrate deploy` on start.

### Roll back a bad import

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/v1/imports/<importId>/preview?workspaceId=<workspaceId>"

curl -X POST -H "Authorization: Bearer <token>" \
  "http://localhost:3001/api/v1/imports/<importId>/rollback?workspaceId=<workspaceId>"
```

### Rotate JWT secrets

Update `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` in `.env`, restart API — all sessions invalidate.

### Increase upload limit

Set `STORAGE_MAX_FILE_SIZE_MB=50` in `.env`; update multer limit in `apps/api/src/modules/import/import.routes.ts` if needed.

### Swap local storage for S3

Implement `StorageDriver` in `apps/api/src/lib/storage.ts`, set `STORAGE_DRIVER=s3`.

---

## Monorepo structure

```
apps/
  api/          Express REST API — /api/v1/
  web/          Next.js 15 App Router
packages/
  db/           Prisma schema, migrations, seed
  shared/       Zod schemas + shared TypeScript types
  ui/           Shared Tailwind components
docker-compose.dev.yml    Postgres only (local dev)
docker-compose.yml        Full stack (production)
```

`PROGRESS.md` and `AI_ROADMAP.md` are gitignored — local reference only. Feature plans live in `implementation-plan.md`.

---

## Import pipeline

1. **Upload** — validates XLSX/XLS, size limit, stores file
2. **Detect** — finds "Master Task List" sheet; dynamic header row
3. **Normalize** — preserves decimal IDs (`0.7`, `13.5`) via cell formatted text
4. **Validate** — per-row VALID / WARNING / ERROR / SKIPPED
5. **Preview** — user reviews and can remap columns
6. **Commit** — transactional: project, sprints, epics, tasks, `TaskAssignment` hours from Excel
7. **Rollback** — removes tasks from that import only

---

## Auth & Roles

### Three-tier RBAC

| Tier | How set | Permissions |
|------|---------|-------------|
| **Super Admin** | `User.role = SUPER_ADMIN` via seed or admin API | Full bypass on all API checks; excluded from assignee rosters; can manage users via `/settings/admin` |
| **Lead** | `ProjectMember.role = LEAD` per project | Create/edit/delete tasks, sprints, epics, assignments, import in their project; see all members' work |
| **Member** (default) | `User.role = MEMBER` | Read all data; write workflow fields (`done`, `blocked`, `deferred`, `columnId`) on assigned tasks only |

### JIT provisioning

Users with an email matching `ALLOWED_EMAIL_DOMAINS` (comma-separated in `.env`) can log in with the `DEFAULT_MEMBER_PASSWORD` without a pre-created account. They are auto-provisioned as `MEMBER`, joined to the default workspace, and forced to change their password on first login.

Super admin emails (`SUPER_ADMIN_EMAILS`) are excluded from JIT and must be seeded explicitly.

### Admin API (`/api/v1/admin/*`)

All routes require `SUPER_ADMIN`. Available at `/settings/admin` in the UI:

| Endpoint | Action |
|----------|--------|
| `GET /admin/users` | List all users |
| `PATCH /admin/users/:id/lead` | Promote/demote project lead |
| `PATCH /admin/users/:id/status` | Activate / deactivate |
| `POST /admin/users/:id/reset-password` | Reset to `DEFAULT_MEMBER_PASSWORD` |

### Rate limiting

Login endpoint: **10 requests/minute/IP** (returns `429` when exceeded).

---

## Architecture

```
Browser (Next.js)  →  Express API (/api/v1/*)  →  PostgreSQL (Prisma)
                                               →  Local FS / S3 (uploads)
```

- JWT access (15 min) + rotating refresh (7 days, httpOnly cookie)
- Global roles: `SUPER_ADMIN` / `MEMBER`; workspace roles: `OWNER` / `ADMIN` / `MEMBER` / `VIEWER`; project roles: `LEAD` / `MEMBER` / `VIEWER`
- Permission engine in `apps/api/src/lib/permissions.ts` — all write routes call `assertCan` before mutating data
- **My Work:** leads/super admin get `allMembersWork[]`; members see own assignments only
- Task mutations logged in `ActivityLog`
- Fractional positions for O(1) card reorder
