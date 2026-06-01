# SprintFlow — Build Progress & Handoff

**Last updated:** 2026-06-01  
**Phases complete:** 0 · 1 · 2 · 3 · 4 · 5 · 6 (Scrum platform) · **7 (Dashboard Customization & Backlog Import)**  
**Status:** Scrum planning pivot shipped; dashboard inline-editing & multi-sheet backlog import fully implemented. See AI_ROADMAP.md for AI work.  
**Repo location:** `/home/mrstark/Documents/Repos/SprintFlow` (also `D:\Development Area\Priyam\SprintFlow`)

---

## Phase 6 — Scrum platform + import dashboard fix (2026-06-01)

### What was built

| Area | Detail |
|---|---|
| **Schema** | `Project`, `ProjectMember`, `TaskAssignment`; sprint `goal`/`days`/release fields; `Task.deferred` / `deferredReason`; priority `P0\|P1\|P2` |
| **API** | `GET/POST /projects`, overview, my-work, team, backlog; `GET /sprints/:id/board`; workspace `mine` hydrates projects with sprints/epics |
| **Web shell** | `(app)` layout + sidebar; routes: `/overview`, `/sprints/[id]`, `/my-work`, `/team`, `/backlog`, `/onboarding`, `/import`, `/board` (Flow) |
| **Scrum UI** | `ProjectOverview`, `SprintBoardView`, `ScrumTaskDrawer`, `InlineAddTask` |
| **Import → dashboard** | `commitImport` requires/resolves `projectId`, adopts workspace sprints by name, post-commit reconciliation; Overview queries by `sprintId ∈ project.sprints`; wizard invalidates cache + links to `/overview` |
| **Security / quality** | `assertWorkspaceMember` on tasks/sprints/imports/activity; assignment validates project member; project role gating; password change revokes refresh tokens; removed duplicate `app/board` and `app/import` routes |

### Import visibility (why Flow worked but Overview did not)

- **Flow** loads tasks by `boardId` (no `projectId` filter).
- **Overview / Backlog / Team** filter by `projectId` and project-scoped sprints.
- Fix: bind every import to a project, attach sprints to that project (reuse legacy workspace sprints by name), always set `task.projectId`, invalidate React Query after commit.

### Verification (2026-06-01)

- `pnpm exec tsc --noEmit -p apps/api` — pass  
- `pnpm exec tsc --noEmit -p apps/web` — pass  
- No automated import/overview tests yet — manual: import → **View project overview** → confirm sprint cards and sidebar sprints

### Import preview / commit fix (2026-06-01)

- **Bug:** Step 3 showed “Internal server error” on commit — `ownerCache` stored user IDs then reused them as `projectMemberId` (FK violation).
- **Fix:** Separate `stubUserCache` vs `projectMemberCache`; workspace id from `/workspaces/mine` when store empty; missing upload file → 404; defensive `messages` array in preview API/UI.

### Known follow-ups (not blocking)

- Multi-sheet Excel importer (Shipped in Phase 7)
- My Work requires `TaskAssignment` rows (owner must match `ProjectMember`)  
- Onboarding “add member” needs invite-by-email or workspace member picker only  
- Flow toggle embedded in sprint board (Flow is a separate route today)

---

## Phase 7 — Dashboard Customization & Backlog Import (2026-06-01)

### What was built

| Area | Detail |
|---|---|
| **API** | `PATCH /projects/:projectId/epics/:epicId` to support inline epic renaming and color picking. |
| **Excel Importer** | Multi-sheet parsing supporting both `📊 Master Task List` and `🔕 Deferred Backlog` tabs; automatically matches and parses backlog stories, marking them as deferred with notes/reasons. |
| **Dashboard Inline Editing** | Click-to-edit for Sprint details (name, goal, status, dates, working days, release milestone details), double-click to rename task titles inline, click-to-select priority dropdown, and inline capacity editing (`hoursPerDay`) in the Team Workload table. |
| **Interactive Owner Chips** | Assignee chips are clickable, displaying popovers to adjust hours, change assignee, or remove assignments, along with inline quick-add assignment indicators. |
| **Microinteractions & Polish** | Added transition scale animations, green flash/tactile click animations on done checkbox toggle, and crimson warning pulses on overloaded project members. |

### Verification (2026-06-01)

- `pnpm exec tsc --noEmit -p apps/api` — pass
- `pnpm exec tsc --noEmit -p apps/web` — pass
- Manual confirmation: Uploaded workbook -> preview stats correctly counted 51 rows (45 active + 6 deferred) -> verified backlog tab is populated.

---

## What SprintFlow Is

An internal task management platform that converts an existing Excel workbook (Master Task List with ~46 tasks) into a live, interactive Scrum board with zero manual re-entry.

**Core principle:** Excel is the bridge. Upload the workbook → tasks appear on the board. After import the DB is the source of truth.

**Owner-stated priority order:** Simplicity → Reliability → Maintainability → Scalability → UX.

---

## Confirmed Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Board model | **One board per workspace**, Sprint/Owner/Backlog are filtered views | Matches Excel mental model, simplest |
| Auth | Admin seeded on boot, admin invites users, no open signup | Internal tool |
| Tenancy | Schema fully multi-workspace, MVP shows one workspace | Zero-migration multi-team later |
| Delivery | Phase-by-phase, pause for review | Agreed with product owner |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | Next.js 15 App Router, TypeScript, TailwindCSS, React Query v5, Zustand v5, dnd-kit |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL via Prisma (ORM) |
| Auth | JWT (15m access + 7d rotating refresh, httpOnly cookie) |
| Excel parsing | SheetJS (xlsx) |
| Password hashing | argon2id |
| File storage | Local FS (interface ready for S3 swap) |
| Deployment | Docker Compose |

---

## Monorepo Structure

```
sprintflow/
├─ apps/
│  ├─ api/                    Express REST API (port 3001)
│  │  └─ src/
│  │     ├─ lib/              env, prisma, jwt, password, storage, rbac, errors
│  │     ├─ middleware/       auth (requireAuth/requireGlobalRole/requireWorkspaceRole),
│  │     │                   validate (Zod), error (envelope)
│  │     └─ modules/
│  │        ├─ health/        GET /api/v1/health
│  │        ├─ auth/          login · refresh · logout · me · change-password
│  │        ├─ users/         invite · claim · list
│  │        ├─ workspaces/    mine · :id
│  │        ├─ boards/        :id (columns+tasks) · add-column · reorder-columns
│  │        ├─ tasks/         CRUD · move · comments
│  │        ├─ sprints/       list · create · update
│  │        ├─ import/        upload · preview · mapping · commit · rollback
│  │        └─ activity/      feed with cursor pagination
│  └─ web/                   Next.js App Router (port 3000)
│     └─ src/
│        ├─ app/             layout, page (redirect), login/, board/, import/
│        ├─ components/
│        │  ├─ auth/          LoginForm
│        │  ├─ board/         Board · BoardColumn · TaskCard · TaskDetailDrawer ·
│        │  │                 CreateTaskForm · DragOverlayCard
│        │  └─ import/        ImportWizard · Step1Upload · Step2Mapping ·
│        │                   Step3Preview · Step4Commit
│        ├─ lib/api/          client (fetch+refresh), auth, import, tasks, boards, workspaces
│        ├─ hooks/            useRequireAuth
│        ├─ providers/        Providers (React Query + API client wiring)
│        └─ store/            auth.store (Zustand+localStorage), board.store (Zustand)
├─ packages/
│  ├─ db/                    Prisma schema, migrations, seed, generated client
│  ├─ shared/                Zod schemas + TypeScript types (web↔api contract)
│  └─ ui/                    Button, Badge, Spinner (shared Tailwind components)
├─ docker-compose.yml        Full stack (postgres + api + web)
├─ docker-compose.dev.yml    Dev (postgres only)
├─ README.md                 Quick-start guide
└─ PROGRESS.md               This file
```

---

## API Endpoints (All Implemented)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | public | DB health check |
| POST | `/api/v1/auth/login` | public | Returns access token + sets refresh cookie |
| POST | `/api/v1/auth/refresh` | cookie | Rotate refresh token |
| POST | `/api/v1/auth/logout` | user | Revoke refresh token |
| GET | `/api/v1/auth/me` | user | Current user + workspace/board memberships |
| POST | `/api/v1/auth/me/password` | user | Change password |
| POST | `/api/v1/users/claim` | public | Claim invited/unclaimed account |
| GET | `/api/v1/users/workspace/:id` | member | List workspace users (assignee picker) |
| POST | `/api/v1/users/workspace/:id/invite` | admin | Invite user |
| GET | `/api/v1/workspaces/mine` | user | First workspace + board + sprints + epics |
| GET | `/api/v1/workspaces/:id` | member | Workspace detail |
| GET | `/api/v1/boards/:id` | member | Board with columns + tasks (filterable) |
| POST | `/api/v1/boards/:id/columns` | member | Add column |
| PATCH | `/api/v1/boards/:id/columns/reorder` | member | Reorder columns |
| POST | `/api/v1/tasks` | member | Create task |
| GET | `/api/v1/tasks/:id` | member | Task detail + comments |
| PATCH | `/api/v1/tasks/:id` | member | Edit task (audited diff) |
| PATCH | `/api/v1/tasks/:id/move` | member | Move task column/position (audited) |
| DELETE | `/api/v1/tasks/:id` | member | Delete task |
| POST | `/api/v1/tasks/:id/comments` | member | Add comment |
| GET | `/api/v1/sprints` | member | List sprints |
| POST | `/api/v1/sprints` | member | Create sprint |
| PATCH | `/api/v1/sprints/:id` | member | Update sprint |
| POST | `/api/v1/imports` | member | Upload + parse workbook (multipart) |
| GET | `/api/v1/imports/:id/preview` | member | Preview rows + stats |
| PATCH | `/api/v1/imports/:id/mapping` | member | Override column mapping + re-validate |
| POST | `/api/v1/imports/:id/commit` | member | Transactional insert all tasks |
| POST | `/api/v1/imports/:id/rollback` | member | Delete tasks from this import |
| GET | `/api/v1/activity` | member | Audit feed (cursor-paginated) |

---

## Database Schema (Key Models)

All models in `packages/db/prisma/schema.prisma`. IDs are `cuid`.

- **User** — `email?`, `passwordHash?` (null for UNCLAIMED stubs), `role(ADMIN|MEMBER)`, `status(ACTIVE|INVITED|UNCLAIMED)`
- **RefreshToken** — server-side revocation list
- **Workspace** → **WorkspaceMember** → **User** (per-workspace RBAC: OWNER/ADMIN/MEMBER/VIEWER)
- **Board** → **BoardColumn** (fractional `position`) → **Task**
- **Task** — `externalId: String` (preserves "0.7", "13.5" from Excel), fractional `position`
- **Sprint**, **Epic** — workspace-scoped, name-unique
- **Import** → **ImportRow** — full pipeline state (upload/parsed/previewed/committed/rolled_back)
- **ActivityLog** — polymorphic by `entityType`+`entityId` (no FK — by design)
- **Comment**, **Attachment**, **Label**, **TaskLabel**, **Notification**, **UserPreference**

**Critical:** Task `externalId` is `String?` — never numeric. SheetJS `.w` formatted text is used when reading cells.

---

## Excel Import Pipeline

The most important feature. Located in `apps/api/src/modules/import/parser/`.

1. **Upload** (`POST /imports`) — magic-byte validate, store via StorageDriver, detect sheet + header row dynamically (no hardcoded row numbers), normalize all rows, create `Import` + `ImportRow` records.
2. **Preview** (`GET /imports/:id/preview`) — returns rows colour-coded VALID/WARNING/ERROR/SKIPPED with per-field messages and aggregate stats.
3. **Remap** (`PATCH /imports/:id/mapping`) — user corrects Excel header → field mapping, rows re-validated.
4. **Commit** (`POST /imports/:id/commit`) — body may include `projectId`; service resolves/falls back to first workspace project. Transaction: adopt or create project-scoped sprints, epics with `projectId`, tasks with `projectId`, `TaskAssignment` from hour columns, reconcile null `projectId` on batch, audit log. Returns `projectId` for client cache invalidation.
5. **Rollback** (`POST /imports/:id/rollback`) — deletes all tasks created by this import; import status → ROLLED_BACK.

**Decimal ID preservation:** `readCell()` uses SheetJS `cell.w` (Excel-formatted text) before falling back to `String(cell.v)`. This preserves "0.7", "13.5", "22.3" as strings.

---

## Auth Flow (Frontend)

1. `apps/web/src/store/auth.store.ts` — Zustand store persisted to localStorage: `accessToken`, `user`, `defaultWorkspaceId`, `defaultBoardId`.
2. `apps/web/src/lib/api/client.ts` — typed `apiFetch` wrapper; on 401 → calls `/auth/refresh` (reads httpOnly cookie) → retries once → on failure clears store + redirects to `/login`.
3. `apps/web/src/providers/Providers.tsx` — wires `apiFetch` to the auth store on mount; listens for `sf:token-refreshed` events.
4. `useRequireAuth()` hook — checks token; redirects to `/login` if absent.

---

## Kanban Board (Phase 3)

- `apps/web/src/components/board/Board.tsx` — DndContext with PointerSensor (8px activation threshold) + KeyboardSensor. `onDragOver` moves task across columns in the React Query cache for real-time visual feedback. `onDragEnd` computes fractional position + calls `PATCH /tasks/:id/move` with optimistic update.
- **Position strategy:** fractional floats — new position = midpoint of prev + next task positions. Avoids full-column renumber on every drop.
- **Task card** (`TaskCard.tsx`) — drag handle separate from click area. Chips: externalId, priority, epic, sprint. Assignee avatar (initials).
- **Task drawer** (`TaskDetailDrawer.tsx`) — slide-over panel, editable title/priority/description/notes, comments, delete.
- **Create task** (`CreateTaskForm.tsx`) — inline "+ Add task" per column, Enter to submit.
- **Add column** — inline input in Board.tsx, creates via `POST /boards/:id/columns`.
- **Audit logging** — task create, update, move, delete, comments all write to `ActivityLog`.

---

## How to Run (Local Dev)

```bash
# Prerequisites: Docker Desktop running, Node 20+, pnpm 9+
# (Install pnpm if needed: npm install -g pnpm@9)

# 1. Install deps
pnpm install

# 2. Copy env
cp .env.example .env

# 3. Start Postgres
docker compose -f docker-compose.dev.yml up -d

# 4. Apply migrations + seed
pnpm db:migrate      # creates all tables
pnpm db:seed         # admin@sprintflow.local / Admin1234!

# 5. Start both services (two terminals)
pnpm --filter @sprintflow/api dev    # http://localhost:3001
pnpm --filter @sprintflow/web dev    # http://localhost:3002

# Or: pnpm dev
```

**Verification flow:**
1. Open `http://localhost:3002` → `/login` → `/overview`
2. Log in as `admin@sprintflow.local` / `Admin1234!`
3. Sidebar → **Import** → upload CARR / Master Task List `.xlsx`
4. Map columns → preview shows **Importing into: &lt;project&gt;**
5. Commit → **View project overview** — sprint health cards populated
6. Sidebar sprints → open sprint board; **Flow** for Kanban DnD
7. Re-import same file to upsert by `externalId` without duplicates

---

## Phase 4 — Completed (2026-05-30)

### What was built

| File | Contents |
|---|---|
| `apps/web/src/lib/api/sprints.ts` | `listSprints`, `createSprint`, `updateSprint` |
| `apps/web/src/lib/api/activity.ts` | `getActivity`, `describeActivity(entry)`, `timeAgo(iso)` |
| `apps/web/src/lib/api/users.ts` | `listWorkspaceUsers(workspaceId, q?)` |
| `apps/web/src/store/board.store.ts` | Added `activeView: BoardView` + `setView` |
| `apps/web/src/components/board/ViewSwitcher.tsx` | Board / Sprint / Backlog / Owner tab switcher |
| `apps/web/src/components/board/FilterBar.tsx` | Sprint · Owner · Epic · Priority selects + "× Clear filters" |
| `apps/web/src/components/board/views/SprintView.tsx` | Cards grouped by sprint, sorted by priority |
| `apps/web/src/components/board/views/BacklogView.tsx` | Sortable table (click column headers) |
| `apps/web/src/components/board/views/OwnerView.tsx` | Cards grouped by assignee |
| `apps/web/src/components/board/Board.tsx` | FilterBar + ViewSwitcher integrated; filters wire into query key; view switching |
| `apps/web/src/components/board/TaskDetailDrawer.tsx` | Sprint/Epic/Assignee selectors (immediate save), activity feed, hours display |

### How Phase 4 works

- **FilterBar** feeds into the board query key (`['board', boardId, filterParams]`). Changing a filter refetches with `?sprint=id&owner=id&…` — the board API already handles all filter params.
- **Views** are client-side groupings of the same filtered board data. No extra API calls; filters + views compose freely.
- **BacklogView** is a sortable table — click any column header to sort by that field (priority/title/sprint/owner/epic).
- **TaskDetailDrawer** sprint/epic/assignee dropdowns save immediately on change (`onChange → updateTask`). Title/description/notes/priority still use the Save button. Activity feed shows last 15 events for the task with human-readable descriptions and relative timestamps.

---

## What's NOT Built Yet (Phase 5)

### Phase 5 — Hardening + Deploy

This is the final MVP phase. Estimated scope: ~1 day.

#### Critical items

1. **`output: 'standalone'`** in `apps/web/next.config.ts` — required for the web Dockerfile to work (it copies `.next/standalone`).
2. **API entrypoint migration**: `docker/Dockerfile.api` should run `prisma migrate deploy` before starting the server. Add a `docker-entrypoint.sh` or change the CMD to chain commands.
3. **End-to-end Docker build**: run `docker compose up --build` and fix any build issues. The Dockerfiles exist but haven't been tested against the full Phase 2–4 codebase yet.

#### Security / upload hardening

4. **Import row/cell limits** in `apps/api/src/modules/import/parser/index.ts` — add a guard: if the sheet has > 5000 rows or > 50 columns, reject with a user-facing error. Prevents zip-bomb / intentionally huge sheets.
5. **Helmet CSP** — review `Content-Security-Policy` defaults for production (Next.js inline scripts need `unsafe-inline` or nonces).
6. **CORS** — verify `CORS_ORIGIN` is never `*` in production `.env`. Document this in the README.

#### README / runbook

7. Expand `README.md` with:
   - Production `.env` checklist (all required vars, no defaults left)
   - `docker compose up` smoke test steps
   - How to reset / re-seed the DB
   - How to roll back a bad import (the rollback endpoint)
   - How to upgrade: `pnpm install && pnpm db:migrate:deploy`

#### Stretch (nice to have, not blocking)

- **Column drag-reorder UI** — API `PATCH /boards/:id/columns/reorder` exists; wrap columns in a horizontal `SortableContext` inside `Board.tsx`.
- **WIP limit warning** — show red badge on `BoardColumn` when `tasks.length >= column.wipLimit` (schema field exists).
- **Notification bell** — `Notification` model exists in schema; add a bell icon + unread count in the top bar.

---

## Key Files to Know

| File | Why it matters |
|---|---|
| `packages/db/prisma/schema.prisma` | Full DB schema — source of truth for all models |
| `packages/shared/src/` | Zod schemas + TypeScript types shared between api and web |
| `apps/api/src/modules/import/parser/` | Excel pipeline — detect.ts, normalize.ts, index.ts |
| `apps/api/src/modules/import/import.service.ts` | Upload/parse/commit/rollback orchestration |
| `apps/api/src/lib/storage.ts` | StorageDriver — swap `LocalStorageDriver` for S3 driver here |
| `apps/web/src/components/board/Board.tsx` | DnD orchestrator + FilterBar/ViewSwitcher + view switching |
| `apps/web/src/components/board/TaskDetailDrawer.tsx` | Drawer with sprint/epic/assignee selectors + activity feed |
| `apps/web/src/lib/api/boards.ts` | `computeDropPosition` + `moveTaskInBoard` — fractional position logic |
| `apps/web/src/lib/api/client.ts` | `apiFetch` — auto-refresh on 401, handles auth errors |
| `apps/web/src/store/auth.store.ts` | Zustand auth state, persisted to localStorage |
| `apps/web/src/store/board.store.ts` | `activeView`, `filters`, `activeTaskId` — board-level UI state |

---

## Risks / Known Issues

| Risk | Status | Notes |
|---|---|---|
| Decimal task IDs corrupted | **Mitigated** | `readCell()` uses SheetJS `.w` formatted text; fixture test recommended |
| Real workbook column names differ from spec | **Mitigated** | Dynamic header detection + editable column map in Step 2 |
| Access token in localStorage | Accepted for MVP | Internal tool; upgrade to httpOnly cookie for production |
| Position float gaps | Deferred | When gaps < 0.001, needs renormalization job — not yet built |
| Docker Desktop not running | Workflow note | Docker needed for Postgres; dev guide covers this |

---

## Phase 5 — Completed (2026-05-30)

### What was built

| Item | Detail |
|---|---|
| `apps/web/next.config.ts` | `output: 'standalone'`, `outputFileTracingRoot` (monorepo root), security headers |
| `apps/web/public/.gitkeep` | Ensures public/ dir exists for Docker COPY |
| `packages/db/package.json` | Moved `prisma` CLI from devDeps to deps (available in prod install) |
| `docker/docker-entrypoint.sh` | Runs `prisma migrate deploy` then starts server |
| `docker/Dockerfile.api` | Uses entrypoint script; prod install includes prisma CLI |
| `docker/Dockerfile.web` | Corrected CMD + `HOSTNAME`/`PORT` env vars for standalone |
| `apps/api/src/modules/import/parser/index.ts` | `enforceSheetLimits()` — rejects sheets > 5000 rows or > 100 columns |
| `apps/api/src/app.ts` | Helmet configured for JSON API (no CSP, no COEP) |
| `apps/api/src/server.ts` | Production secret validator — refuses to start with dev-placeholder secrets |
| `apps/web/src/components/board/BoardColumn.tsx` | Column `useSortable` — drag handle on header, column becomes draggable |
| `apps/web/src/components/board/Board.tsx` | `SortableContext` for columns, `handleDragEnd` routes to `reorderColumns` |
| `README.md` | Full production runbook (secrets, Docker, smoke test, ops procedures) |
| `AI_ROADMAP.md` | Detailed AI integration plan (5 features, model choices, architecture) |

### Docker verification steps

```bash
# Start Docker Desktop, then:
docker compose up --build

# Smoke test:
curl http://localhost:3001/api/v1/health   # → {"status":"ok","db":"ok"}
curl -I http://localhost:3000              # → HTTP 200

# Import flow:
# 1. Open http://localhost:3000 → login → /import → upload workbook
# 2. Verify decimal IDs (0.7, 13.5) preserved in Step 3 preview
# 3. Commit → board shows all tasks
# 4. Drag a task → refresh → position persists
# 5. Drag a column header → columns reorder → refresh → order persists
```

---

## MVP + Scrum platform status

Phases 0–6 shipped. Core promise:

> Upload the Excel workbook you already use. Within a minute you have a project Overview, sprint boards, capacity views, and a Flow Kanban — no manual re-entry.

**What's been built:**
- Excel → **project dashboard** + Flow board (import binds to active project)
- Scrum: Overview, per-sprint board, My Work, Team, Backlog, onboarding wizard
- Flow: Kanban DnD, filters (P0/P1/P2), task drawer
- `Project` / `ProjectMember` / `TaskAssignment` model for CARR-style hour planning
- JWT auth, workspace membership checks on sensitive routes, audit trail
- Production Docker Compose deployment
- AI interfaces ready (see `AI_ROADMAP.md`)

The original architecture plan: `C:\Users\surya\.claude\plans\claude-code-master-jaunty-steele.md`
