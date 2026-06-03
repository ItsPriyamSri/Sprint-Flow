# SprintFlow — Build Progress & Handoff

**Last updated:** 2026-06-03  
**Phases complete:** 0 · 1 · 2 · 3 · 4 · 5 · 6 (Scrum platform) · 7 (Dashboard Customization & Backlog Import) · **8 (Collaboration & Reporting)** · **9 (Backlog UX & Sprint CRUD polish)** · **10 (Epic management, destructive deletes & Epics page)** · **11 (My Work — role-based view)**  
**Status:** Full Scrum platform through Phase 11 — My Work page now shows all team members' tasks when logged in as admin, and personal + shared tasks only for regular members. See AI_ROADMAP.md for AI work.  
**Repo location:** `/home/mrstark/Documents/Repos/SprintFlow` (also `D:\Development Area\Priyam\SprintFlow`)

---

## Phase 11 — My Work role-based view (2026-06-03)

### What was built

| Area | Detail |
|---|---|
| **Shared types** | Added `MemberWorkSummaryDto` (member + task lists). Extended `MyWorkDto` with `isAdmin: boolean` and `allMembersWork?: MemberWorkSummaryDto[]`. |
| **API** | `GET /projects/:projectId/my-work` — checks `req.user.role === 'ADMIN'`; if admin, fetches all project members' `TaskAssignment`s and returns per-member `todayFocus`, `currentSprintTasks`, `upcomingTasks` grouped in `allMembersWork`. Non-admin path unchanged. |
| **My Work page** | Admin sees **"Team Work"** view: one collapsible `MemberWorkSection` card per project member (avatar, name, role, progress ring, tasks). Non-admin sees their own tasks as before. Header label switches between "Admin View / Team Work" and "My Dashboard / My Work". Progress ring shows team-wide aggregate for admin. |
| **Placeholder emails** | Role check uses `req.user.role` (JWT `GlobalRole`). Real email → role mapping to be wired in when employee emails are confirmed. Mock admin login (`admin@sprintflow.local`) shows all members' tasks today. |

### Verification (2026-06-03)

- `pnpm --filter @sprintflow/api typecheck` — pass  
- `pnpm --filter @sprintflow/web typecheck` — pass  
- Log in as `admin@sprintflow.local` → My Work → **Team Work** heading, collapsible card per project member (Iris, Nate, Alex, etc.) with that member's assigned tasks.  
- Log in as a non-admin member (e.g. seeded Iris/Nate) → My Work → **My Work** heading, only tasks with a `TaskAssignment` for that user (includes multi-assignee / "shared" tasks where they have a row).  

### Known follow-ups (not blocking)

- Wire **employee email allowlist** (e.g. Ishika, Naazish) when addresses are confirmed — today admin detection is `User.role === 'ADMIN'` on JWT (mock admin: `admin@sprintflow.local`).  
- Optional env-based admin emails (`MY_WORK_ADMIN_EMAILS`) for admins who are not `GlobalRole.ADMIN`.  
- Admin view: open task drawer from a team member's card.  

---

## Phase 10 — Epic management, destructive deletes & Epics page (2026-06-03)

### What was built

| Area | Detail |
|---|---|
| **Epic API** | `GET /projects/:projectId/epics` — epics with grouped tasks + unassigned bucket. `POST /projects/:projectId/epics` — create (name, optional color). `PATCH` / `DELETE` epic (delete blocked with **409** if tasks still reference epic). |
| **Shared types** | `EpicTaskItemDto`, `EpicWithTasksDto`, `ProjectEpicsViewDto` in `@sprintflow/shared`. |
| **Web API** | `getProjectEpics`, `createEpic`, `deleteEpic`; `deleteSprint`, `deleteProject` client helpers. |
| **Epics page** | Route `/epics` — single hub for all epics: collapsible sections per epic, task table (title, priority, sprint link, hours), **No epic assigned** section, **New Epic** / **Edit epic** via `EpicFormModal`. |
| **Navigation** | Sidebar **Epics** nav link (not an expandable list). Dashboard epic analytics remain read-only with **Manage epics** → `/epics`. Removed duplicate epic UI from Overview and sidebar tree. |
| **Sprint delete** | `DELETE /sprints/:sprintId?workspaceId=` — **409** if sprint has tasks. Trash on sidebar sprint rows + Overview sprint cards + **Delete sprint** on sprint board header. |
| **Project delete** | `DELETE /projects/:projectId` — transactional cascade (tasks → sprints → epics → project). Prominent `ConfirmDialog` requires typing **`CONFIRM`**. Entry: project switcher → **Delete project**. |
| **UX fixes** | `BlockedToggle` popover rendered via portal + viewport clamping (no clip inside overflow scroll areas). |
| **Cache / helpers** | `invalidateProjectScopedQueries` (+ `project-epics` key); `confirmDeleteSprint` / `confirmDeleteProject` in `lib/deleteActions.ts`; `requireTypedConfirm` on confirm store. |

### Verification (2026-06-03)

- `pnpm --filter @sprintflow/api typecheck` — pass  
- `pnpm --filter @sprintflow/web typecheck` — pass  
- Manual: **Epics** page lists tasks per epic; create/edit/delete epic refreshes board filters; delete empty sprint; delete project after typing CONFIRM removes all project data; block popup fully visible on left-column tasks.

### Known follow-ups (not blocking)

- Epic page: open task in drawer from task row (today read-only list + sprint links)  
- Sprint delete with type-`CONFIRM` (project delete already has it)  
- Automated E2E for epic CRUD and cascade project delete  

---

## Phase 6 — Scrum platform + import dashboard fix (2026-06-01)

### What was built

| Area | Detail |
|---|---|
| **Schema** | `Project`, `ProjectMember`, `TaskAssignment`; sprint `goal`/`days`/release fields; `Task.deferred` / `deferredReason`; priority `P0\|P1\|P2` |
| **API** | `GET/POST /projects`, overview, my-work, team, backlog; `GET /sprints/:id/board`; workspace `mine` hydrates projects with sprints/epics |
| **Web shell** | `(app)` layout + sidebar; routes: `/dashboard`, `/overview`, `/epics`, `/sprints/[id]`, `/my-work`, `/team`, `/backlog`, `/activity`, `/onboarding`, `/import`, `/board` (Flow) |
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
│        ├─ app/             layout, login/, dashboard/, overview/, epics/, backlog/, sprints/[id]/, …
│        ├─ components/
│        │  ├─ auth/          LoginForm
│        │  ├─ board/         Board · BoardColumn · TaskCard · TaskDetailDrawer ·
│        │  │                 CreateTaskForm · DragOverlayCard
│        │  └─ import/        ImportWizard · Step1Upload · Step2Mapping ·
│        │                   Step3Preview · Step4Commit
│        │  └─ scrum/         SprintBoardView · EpicFormModal · InlineAddTask · SprintCreateModal
│        ├─ lib/api/          client (fetch+refresh), auth, import, tasks, boards, projects, sprints
│        ├─ lib/              queryInvalidation · deleteActions
│        ├─ hooks/            useRequireAuth
│        ├─ providers/        Providers (React Query + API client wiring)
│        └─ store/            auth.store, board.store, project.store, confirm.store
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
| DELETE | `/api/v1/sprints/:id` | member | Delete sprint (409 if tasks assigned) |
| GET | `/api/v1/projects/:id/epics` | member | Epics with tasks + unassigned bucket |
| POST | `/api/v1/projects/:id/epics` | member | Create epic |
| PATCH | `/api/v1/projects/:id/epics/:epicId` | member | Update epic name/color |
| DELETE | `/api/v1/projects/:id/epics/:epicId` | member | Delete epic (409 if tasks assigned) |
| DELETE | `/api/v1/projects/:id` | member | Delete project + cascade (tasks, sprints, epics) |
| POST | `/api/v1/imports` | member | Upload + parse workbook (multipart) |
| GET | `/api/v1/imports/:id/preview` | member | Preview rows + stats |
| PATCH | `/api/v1/imports/:id/mapping` | member | Override column mapping + re-validate |
| POST | `/api/v1/imports/:id/commit` | member | Transactional insert all tasks |
| POST | `/api/v1/imports/:id/rollback` | member | Delete tasks from this import |
| GET | `/api/v1/activity` | member | Audit feed (cursor-paginated) |
| GET | `/api/v1/projects/:id/my-work` | member | Personal work queue; `isAdmin` + `allMembersWork[]` when `User.role === ADMIN` |
| GET | `/api/v1/projects/:id/epics` | member | Epics with implementing tasks |
| POST/PATCH/DELETE | `/api/v1/projects/:id/epics/...` | member | Epic CRUD |
| DELETE | `/api/v1/projects/:id` | member | Delete project (cascade) |
| DELETE | `/api/v1/sprints/:id` | member | Delete sprint (409 if tasks exist) |

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

**Local dev gotchas (2026-06-02):**
- Postgres must be running before starting the API (`docker compose -f docker-compose.dev.yml up -d`).
- Root `.env` `DATABASE_URL` must use host port **5433** (maps to container 5432). Avoid duplicate/conflicting env blocks in `.env`.
- `pnpm db:seed` loads the root `.env` via `tsx --env-file=../../.env` in `packages/db/package.json`.
- Web dev server always runs on **3002** regardless of `WEB_PORT` in `.env`; set `CORS_ORIGIN=http://localhost:3002`.

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
| `apps/web/src/components/scrum/SprintBoardView.tsx` | Sprint board — inline edits, blocked toggle (portal popover), add/delete tasks, delete sprint |
| `apps/web/src/components/scrum/EpicFormModal.tsx` | Create/edit/delete epic modal + `invalidateEpicQueries` |
| `apps/web/src/app/(app)/epics/page.tsx` | Epics hub — all epics with implementing tasks |
| `apps/web/src/lib/deleteActions.ts` | `confirmDeleteSprint` / `confirmDeleteProject` (typed CONFIRM for projects) |
| `apps/web/src/components/ui/ConfirmDialog.tsx` | App-wide confirm; optional `requireTypedConfirm` |
| `apps/web/src/components/scrum/InlineAddTask.tsx` | Inline task creation on sprint board (title, priority, owner, hours) |
| `apps/web/src/app/(app)/backlog/page.tsx` | Backlog table with search, filters, analytics summary cards |
| `apps/web/src/app/(app)/my-work/page.tsx` | Personal queue or admin **Team Work** (`MemberWorkSection` per member) |
| `packages/shared/src/types.ts` | `MyWorkDto`, `MemberWorkSummaryDto`, `ProjectEpicsViewDto`, etc. |

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

Phases 0–11 shipped. Core promise:

> Upload the Excel workbook you already use. Within a minute you have a project Overview, sprint boards, capacity views, and a Flow Kanban — no manual re-entry.

**What's been built:**
- Excel → **project dashboard** + Flow board (import binds to active project)
- Scrum: Overview, **Epics** page (epics + tasks), per-sprint board, **My Work** (admin = all members' tasks; members = own assignments only), Team, Backlog (search/filter + analytics), onboarding wizard
- Epic CRUD + cascade project delete (type `CONFIRM`) + sprint delete when empty
- Sprint board: inline add task (`InlineAddTask`), per-row delete, empty-sprint UX for UI-created sprints
- Flow: Kanban DnD, filters (P0/P1/P2), task drawer; cross-view React Query invalidation on task moves
- Blocked tasks, comment edit/delete (own), workspace Activity timeline, executive Project Dashboard
- `Project` / `ProjectMember` / `TaskAssignment` model for CARR-style hour planning
- JWT auth, workspace membership checks on sensitive routes, audit trail
- Production Docker Compose deployment
- AI interfaces ready (see `AI_ROADMAP.md`)

The original architecture plan: `C:\Users\surya\.claude\plans\claude-code-master-jaunty-steele.md`

---

## Phase 8 — End-to-End Scrum Workflow, Collaboration & Reporting Dashboard (2026-06-01)

### What was built

| Area | Detail |
|---|---|
| **Database Schema** | Added `blocked: Boolean` and `blockedReason: String?` to the `Task` model. Added `TASK_BLOCKED` and `TASK_UNBLOCKED` to the `ActivityAction` database enum via SQL migration `add_blocked_to_task`. |
| **API & Backend Logic** | Updated task endpoints to audited state adjustments for blocked status changes. Implemented `PATCH` (editing) and `DELETE` (deleting) comments validation checking to verify ownership. |
| **Web client APIs** | Registered `describeActivity` mappings, updated `TaskDetail` and `BoardTask` definitions, and added `getProjectDashboard` API hooks. |
| **Sidebar & Modals** | Integrated `+ Create Sprint` button, configured `SprintCreateModal` fields, and mapped navigation item routing to new pages. |
| **Project Overview** | Updated `SprintCard` items with horizontal progress bars, active status distributions (Todo · In Progress · Done · Blocked), capacity metrics, and button selectors to prevent link wrapping hydration mismatches. |
| **Sprint Board** | Structured `BlockedToggle` control column, red-tinted blocked visual rows, and hovered reason tooltips. |
| **Flow Board Cards** | Highlighted blocked tasks using outline crimson borders and animated pulse badges. |
| **Task Drawers** | Built in-drawer Blocked checkboxes and reason input overlays, and integrated comment ownership modification (Edit/Delete own comments only) across both Scrum and Kanban panels. |
| **My Work Page** | Configured dedicated red-tinted "Blocked Tasks" card grids surfaced above nice-to-have items, sorted by priority. |
| **Backlog Page** | Appended "Blocked" validation column, displaying tooltip badges and styling blocked rows with warning indicators. |
| **Global Activity Feed** | Created Workspace Activity Timeline rendering events chronologically, supporting infinite cursor loading, actor initials, and quick navigation. |
| **Project Dashboard** | Designed a responsive executive interface containing: <br>1. **Project Metrics**: dynamic visual cards (Total, Completed, In-progress, Blocked with red animated pulse, Backlog, and Deferred). <br>2. **Sprint Health**: progress timelines with completion bar color-coding (green >= 80%, amber >= 50%, red < 50%). <br>3. **Workload Balance**: owner commitment vs capacity limits with overloading warnings. <br>4. **Epic Analytics**: progress bars matching database `Epic.color`. |

### Verification (2026-06-01)

- `pnpm exec tsc --noEmit -p apps/api` — **PASS**
- `pnpm exec tsc --noEmit -p apps/web` — **PASS**
- Verification of database structural changes and front-end reactivity complete with no warnings.

### Bug Fixes (2026-06-01)

- **API Serialization Bug Fix**: Resolved runtime filtering and visual issues where `blocked` and `blockedReason` fields were omitted in the task-to-DTO serialization. Modified the following endpoints to correctly serialize and return `blocked` and `blockedReason` fields to the web application:
  1. `apps/api/src/modules/projects/projects.routes.ts` (My Work `taskToDto` and `/:projectId/backlog`)
  2. `apps/api/src/modules/boards/boards.routes.ts` (`GET /boards/:boardId`)
  3. `apps/api/src/modules/sprints/sprints.routes.ts` (`GET /:sprintId/board`)
  This fully hydrates the frontend components on My Work, Backlog, Flow, and Sprint boards with correct blocked-state data.

---

## Phase 9 — Backlog UX & Sprint CRUD Polish (2026-06-02)

### What was built

| Area | Detail |
|---|---|
| **Backlog page** | Search by title/epic; filter by priority and epic; summary analytics cards (total hours, blocked count, deferred count); promote-to-sprint unchanged. |
| **Cross-view cache sync** | Flow board moves, sprint-board assignment/blocked/done toggles, and task deletes invalidate `project-overview`, `project-dashboard`, `sprint-board`, `backlog`, `my-work`, and `workspace` queries so Scrum views stay in sync with Flow. |
| **Sprint board — add task** | `InlineAddTask` per epic section: title, P0/P1/P2, owner, hours; creates task in first Flow column with `sprintId` + `projectId`; optional `TaskAssignment`. |
| **Sprint board — empty sprint UX** | UI-created sprints with zero tasks render a **No Epic** section so **Add task** is always available (no dead-end empty state). |
| **Sprint board — delete task** | Trash icon on each task row with confirm dialog; calls `DELETE /tasks/:id`; closes drawer if active task deleted; invalidates all project views. |
| **Dev DX** | `packages/db` seed script loads root `.env` (`tsx --env-file=../../.env`); documented Postgres port / CORS / duplicate-`.env` pitfalls. |

### Verification (2026-06-02)

- `pnpm exec tsc --noEmit -p apps/api` — pass
- `pnpm exec tsc --noEmit -p apps/web` — pass
- Manual: create sprint in UI → **Add task** → task appears on sprint board and Overview; delete task → removed from all views; backlog search/filter narrows rows; Flow drag updates Overview counts without refresh.

### Known follow-ups (not blocking)

- My Work (non-admin) requires `TaskAssignment` rows (owner must match `ProjectMember`)
- Onboarding “add member” needs invite-by-email or workspace member picker only
- Flow toggle embedded in sprint board (Flow is a separate route today)
- No automated E2E tests for sprint add/delete or backlog filters

---

## 🎬 SprintFlow Platform Live Demo Script

This script provides a step-by-step narrative to showcase the entire end-to-end capabilities of SprintFlow—from importing raw Excel workbooks to executive tracking and team collaboration.

### 🎭 Scene 1: The Zero-Manual-Reentry Excel Onboarding
* **Speaker Script:** "We've all been there: team planning is stuck in Excel sheets, and moving to an interactive system usually means hours of manual re-entry. SprintFlow solves this instantly. Let's start with a blank canvas."
* **Action:** 
  1. Navigate to `/onboarding` or click **New Project** in the sidebar.
  2. Click **Import Excel** tab.
  3. Drag and drop the Excel workbook (e.g. Master Task List containing active items and deferred backlog).
  4. Match the columns in **Step 2 (Mapping)**: verify title, priority, owner, hours, and notes columns.
  5. In **Step 3 (Preview)**: point out the parsed stats: *51 tasks detected (45 active, 6 deferred)*.
  6. Click **Commit Import**.
  * **Result:** The wizard invalidates the cache, builds the workspace, creates all Sprints, Epics, Tasks, and assignments, and redirects you directly to the **Project Overview**.

---

### 🎭 Scene 2: Sprint Planning & Health Analytics
* **Speaker Script:** "In less than ten seconds, our Excel spreadsheet has been turned into a fully functional Scrum project. Let's look at how our sprints are organized."
* **Action:**
  1. Observe the **Project Overview** page. Point out the beautiful cards representing each sprint.
  2. Show the **Sprint Health progress bar** on active cards (task completion percentage), capacity summaries, and task distributions (Todo · In Progress · Done · Blocked counts).
  3. Click **+ Create Sprint** in the sidebar: name it "Sprint 3", set dates, goals, and assign it to a "Release 1.0 Milestone". Submit it.
  4. Open the new sprint board → click **Add task** under any epic (or the default No Epic section) → enter title, priority, owner, hours → confirm.
  5. Optionally delete a manually added task via the trash icon on the row (confirm dialog).
  * **Result:** "Sprint 3" instantly appears in the sidebar sprint list; tasks can be added and removed without re-importing Excel.

---

### 🎭 Scene 3: The Board, Blocked States & Collaboration
* **Speaker Script:** "Now, let's look at sprint execution. Teams can view their epic-grouped lists or jump into the interactive Kanban Board."
* **Action:**
  1. Click **View Board** on a Sprint card or select **Flow view** in the sidebar.
  2. Drag cards between columns (optimistic updates with fractional positions).
  3. Click a task card to open the **Task Detail Drawer**.
  4. **Toggle the Blocked checkbox**: write a block reason, e.g., *"Blocked waiting on security clearance"* and save.
  5. Notice the visual change: the card on the board gets a thick crimson left border and a red pulsing 🚫 **Blocked** indicator badge.
  6. Write a comment: *"I've followed up on this blocker; checking back tomorrow."* and post.
  7. Hover over your comment, click **Edit**, modify the text, and click **Save**.
  * **Result:** The system enforces strict ownership (only you can edit/delete your own comments) and logs audit trails.

---

### 🎭 Scene 4: Personal Workflows & The Backlog
* **Speaker Script:** "Every engineer gets a personal, high-focus dashboard called My Work. Admins see the whole team's assignments in one place; each person only sees their own work (including tasks shared with other assignees)."
* **Action:**
  1. Navigate to the **My Work** page in the sidebar.
  2. **As admin** (`admin@sprintflow.local`): show **Team Work** — one collapsible section per team member with their P0/P1/P2/blocked groupings and per-member progress.
  3. **As a team member** (or describe for demo): show **My Work** — only that user's assigned tasks, organized by priority, with **Blocked Tasks** surfaced above P2.
  4. Point out task cards list all assignees on multi-owner tasks (shared work visible on the card).
  5. Navigate to the **Backlog** page.
  6. Point out the summary analytics cards (total hours, blocked, deferred) and the search/filter bar (by title, priority, epic).
  7. Show the table of tasks with no sprint assigned or marked deferred.
  8. Show the **Blocked column** and the warning border on blocked backlog rows with their block reasons.
  * **Result:** Complete team transparency. Admins get a team-wide My Work view; individuals stay focused on their own queue. Blocker reasons are front-and-center so nothing falls through the cracks.

---

### 🎭 Scene 5: Workspace Timeline & The Executive Dashboard
* **Speaker Script:** "Finally, SprintFlow provides a full workspace audit feed and an executive-level reporting dashboard, built entirely on custom CSS metrics with zero heavy graphing libraries."
* **Action:**
  1. Navigate to the **Activity** page.
  2. Scroll down the beautiful timeline, showcasing actor initials, relative time stamps (e.g. *2m ago*), and dynamic action descriptions (*"blocked this task (Blocked waiting on security clearance)"*).
  3. Click **View Task Details** link on any activity item to instantly navigate back to the item.
  4. Navigate to the **Dashboard** page.
  5. Present the 4 visual sections:
     - **Summary Cards**: color-coded widgets showcasing project status counts, with an active animated pulse on the Blocked count.
     - **Sprint Health**: progress lines displaying completion rates per sprint, highlighting the active sprint.
     - **Workload Balance**: table demonstrating hours committed vs capacity per team member, highlighting overloaded members in a thick crimson warning.
     - **Epic Completion**: epic-grouped analytics with progress meters rendered in the epic's database color; **Manage epics** links to the dedicated Epics page.
  6. Navigate to **Epics** in the sidebar.
  7. Show each epic with its implementing tasks (priority, sprint, hours). **New Epic** / **Edit epic** for rename and color. Note project delete (project menu → type `CONFIRM`) and sprint delete when the sprint has no tasks.
* **Concluding Script:** "From an offline Excel workbook to a live, beautiful, collaborative Scrum ecosystem in seconds. That's SprintFlow."
