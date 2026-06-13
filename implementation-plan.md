---

# Completed Work Log: Excel Import & Project Isolation

**Status:** ✅ Implemented — 2026-06-13
**Last updated:** 2026-06-13

---

## Import UX improvements

### Import from sheet — entry points added
- **SprintCreateModal**: added "Import from sheet" button in the header that closes the modal and navigates to `/import`.
- **Sidebar**: import link updated to use active nav styling; "Import from sheet" option added to the project-switcher dropdown.
- **Step1Upload**: removed the manual "Analyse workbook →" button. Selecting or dropping a file now immediately triggers the upload and shows an inline spinner. The wizard auto-advances to Step 2 on success.

### Import as new project
- **Step3Preview**: replaced static target-project display with a destination selector — toggle between "Add to existing project" (default) and "Create new project" with a name input.
- **ImportWizard**: `onCommit` now passes `newProjectName?: string` to `commitImport`.
- **`apps/web/src/lib/api/import.ts`**: `commitImport` opts extended with `newProjectName?: string`.
- **`import.controller.ts`**: Zod schema accepts `newProjectName`.
- **`import.service.ts`**: `resolveImportProjectId` creates a minimal project via Prisma when `newProjectName` is provided (bypasses the project-creation wizard's member min(1) constraint).

### Project creation wizard fix
- **`projects.routes.ts`**: changed `members: z.array(...).min(1)` → `.min(0)`. Admin users start with an empty members array; the previous constraint caused "Validation failed" on the last wizard step.

---

## Excel parser fixes (ScrumforGamifiedApp.xlsx format)

### Column mapping
- Added `hrsest`, `hrsestimated`, `esthrs`, `esthours` to `hoursN` patterns in `constants.ts` so "Hrs Est." columns are correctly mapped to estimated hours.

### Priority mapping
- Added `p4: 'P2'` to `PRIORITY_MAP` in `constants.ts`.

### Section-header row detection
- `parseSheetRows` now detects rows that have data in only the ID/label cell and no task fields (sprint separators, epic group headers, TOTALS rows). These rows are silently skipped instead of emitting ERROR rows.
- Sprint name is extracted from the section header text (e.g. `"Sprint 1 · 9–14 Jun · 64h estimated"` → `"Sprint 1"`) and injected into all subsequent task rows that have no `sprintName` column.

### Sprint metadata from individual sprint sheets
- **`parser/index.ts`**: `extractSprintMetaFromSheets` scans each non-main sheet. For sheets whose row 0 contains a sprint name, it extracts:
  - Date range from the header (handles same-month `"9–14 Jun 2025"` and cross-month `"30 Jun–5 Jul 2025"` formats) → `startDate`/`endDate` (YYYY-MM-DD).
  - Sprint goal from row 1 (`"Sprint Goal: …"`) → `goal`.
- `ParseResult` now carries `sprintMeta: Record<string, SprintMeta>`.
- **`import.service.ts`**: `serializeStats` stores `sprintMeta` in the import's JSON stats so it survives the upload→commit round-trip.
- **`resolveOrCreateSprintForImport`**: when creating a new sprint, looks up the meta map by sprint name and sets `goal`, `startDate`, `endDate` on the Prisma create.

---

## Project isolation — cross-project contamination fixes

All four issues caused tasks or metrics from one project to appear on another project's pages.

### Fix 1 — Flow view (board): no project scoping (biggest issue)
- **`boards.routes.ts`**: added `project` as an optional query param; tasks Prisma query now includes `...(projectId ? { projectId } : {})`.
- **`Board.tsx`**: imports `useProjectStore`; `filterParams` always includes `project: activeProjectId`. Switching projects triggers an immediate cache-key change and refetch. `updateBoardCache` continues to work because it matches on `['board', boardId]` prefix, covering all filter variants.

### Fix 2 — Overview: `allTasks` query not belt-and-suspenders scoped
- **`projects.routes.ts`** (`GET /:projectId`): `allTasks` findMany now uses `where: { projectId, sprintId: { in: allSprintIds } }`. Previously only filtered by sprint IDs; adding `projectId` prevents any cross-project task from leaking in if sprint IDs were ever shared.

### Fix 3 — Import: sprint adoption could steal sprints from other projects
- **`resolveOrCreateSprintForImport`** previously searched for sprints using `OR: [{ projectId: null }, { projectId }]`. A workspace-scoped sprint (e.g. `Sprint 1` with `projectId: null`) would be adopted by the new import and its `projectId` updated to the new project. When the new project was later deleted, those sprints were deleted too, orphaning the original project's tasks and permanently corrupting its metrics.
- Fixed: now searches only `{ workspaceId, projectId, name }` — strictly project-scoped. Each import creates its own sprints. No workspace-scoped sprint adoption.

### Already correct (no changes needed)
- Team (`/projects/:projectId/team`): assignments scoped via `projectMember: { projectId }`.
- My Work (`/projects/:projectId/my-work`): scoped via `ProjectMember` record for `{ projectId, userId }`.
- Backlog, Epics, Sprint board: all query by `projectId` or project-specific sprint IDs.
- Team member shared across projects: each project gets its own `ProjectMember` record; `TaskAssignment` links to `ProjectMember`, not `User`, so assignments are naturally project-isolated.

---

<br/>

---

# Implementation Plan: Cross-View Task State Sync

**Status:** Planned — not implemented  
**Last updated:** 2026-06-08

---

## Problem statement

Task state (`done`, `blocked`, column position) lives in the DB but is not consistently reflected across all views when changed from one surface. Specifically:

| Action | Should update | Currently does |
|---|---|---|
| Drag task to "Done" column in Flow | `task.done = true`; Sprint board, My Work, Epics, Dashboard refresh | Only moves column; `done` stays false; epics never refresh |
| Drag task out of "Done" column | `task.done = false`; all views refresh | Only moves column; `done` stays true |
| Tick done on Sprint board | Flow board re-fetches; Epics re-fetches | Missing `board` and `project-epics` invalidations |
| Tick done in Task Detail Drawer | Flow board, Epics re-fetch | Missing `board` and `project-epics` invalidations |
| Any task mutation via `invalidateProjectScopedQueries` | Flow board re-fetches | `board` key missing from helper |

---

## Gap inventory

### Gap 1 — Backend: Flow board drag does not set `task.done`

**File:** `apps/api/src/modules/tasks/tasks.service.ts` — `moveTask()` (~line 222)

`moveTask` only writes `{ columnId, position }`. It already fetches `updated.column.name` (the destination column) and `oldCol.name` (the source column) for audit logging but does nothing with them to infer `done`.

**Fix:** After the move update, check column names against a "done" pattern and patch `task.done` accordingly in the same function:

```ts
const DONE_COL = /^(done|completed|finished)$/i;

const destIsDone = DONE_COL.test(updated.column.name.trim());
const srcIsDone  = oldCol ? DONE_COL.test(oldCol.name.trim()) : false;

if (destIsDone && !old.done) {
  await prisma.task.update({ where: { id: taskId }, data: { done: true } });
} else if (srcIsDone && !destIsDone && old.done) {
  await prisma.task.update({ where: { id: taskId }, data: { done: false } });
}
```

The audit log action should be upgraded to `TASK_DONE` / `TASK_UPDATED` accordingly (matching the existing pattern in `updateTask`).

> **Column name contract:** "Done" is the only name that triggers this. If the workspace uses a different name (e.g. "Shipped"), the regex can be extended or made configurable via an env var later.

---

### Gap 2 — Frontend: Missing `board` invalidation on done toggle

Every surface that sets `task.done` via `PATCH /tasks/:id` must also invalidate the Flow board query so the card visually updates (opacity, position awareness).

**Files and lines:**

| File | Mutation | Missing key |
|---|---|---|
| `SprintBoardView.tsx:1441` | `doneMutation.onSuccess` | `['board']` |
| `TaskDetailDrawer.tsx:404` | save mutation `onSuccess` | `['board']` |
| `TaskDetailDrawer.tsx:432` | delete mutation `onSuccess` | `['board']` |

---

### Gap 3 — Frontend: Missing `project-epics` invalidation everywhere

The Epics page (`/epics`) is never re-fetched when tasks are marked done or moved. It shows a "X of Y tasks done" counter and line-through styling that goes stale.

**Files and lines:**

| File | Mutation | Missing key |
|---|---|---|
| `SprintBoardView.tsx:1441` | `doneMutation.onSuccess` | `['project-epics']` |
| `Board.tsx:93` | move `onSuccess` | `['project-epics']` |
| `TaskDetailDrawer.tsx:404` | save mutation `onSuccess` | `['project-epics']` |
| `TaskDetailDrawer.tsx:432` | delete mutation `onSuccess` | `['project-epics']` |

---

### Gap 4 — Frontend: `invalidateProjectScopedQueries` missing `board`

**File:** `apps/web/src/lib/queryInvalidation.ts`

The shared helper used by task create/delete/structural changes doesn't include the `board` query key. Any place that calls this helper (e.g. `InlineAddTask`, drawer delete) leaves the Flow board stale.

**Fix:** Add one line:

```ts
void queryClient.invalidateQueries({ queryKey: ['board'] });
```

---

### Gap 5 — Frontend: My Work done UX (admin member cards)

In the regular (non-admin) My Work view, done tasks already collapse into a "Completed Tasks" collapsible section. In the **admin** view (`MemberWorkSection`), the `TaskSections` component is rendered per member and already passes `currentSprintTasks` through — so it also has the Completed section. This is already correct once Gap 1 is fixed (tasks dragged to Done in Flow will populate it).

Minor enhancement: add a green ✓ indicator to the `TaskCard` when `task.done = true`, complementing the existing `opacity-55` + line-through:

```tsx
{task.done && (
  <span className="rounded-md bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-600 uppercase tracking-wide">
    ✓ Done
  </span>
)}
```

Place it alongside the P0/P1/blocked badges in the card header row.

---

## Implementation order

| Step | File(s) | Risk | Effort |
|---|---|---|---|
| **1** — Gap 1: auto-done on column move | `tasks.service.ts` | Low — additive logic, isolated to moveTask | ~15 min |
| **2** — Gap 4: add `board` to shared invalidation helper | `queryInvalidation.ts` | Low — one line | ~2 min |
| **3** — Gap 2: add `['board']` to done mutations | `SprintBoardView.tsx`, `TaskDetailDrawer.tsx` | Low — additive | ~5 min |
| **4** — Gap 3: add `['project-epics']` everywhere | `SprintBoardView.tsx`, `Board.tsx`, `TaskDetailDrawer.tsx` | Low — additive | ~5 min |
| **5** — Gap 5: done badge in My Work TaskCard | `my-work/page.tsx` | Low — visual only | ~5 min |

**Total estimated effort:** ~30 min. Do steps 1–4 together (they're all backend/invalidation), then step 5 as a polish pass.

---

## What's already working (no change needed)

| Area | State |
|---|---|
| Sprint board done toggle → `sprint-board`, `project-overview`, `project-dashboard`, `backlog`, `my-work`, `workspace` | ✅ All invalidated |
| Flow board move → `project-overview`, `project-dashboard`, `sprint-board`, `backlog`, `my-work`, `workspace`, `board` | ✅ All invalidated (board is already in Board.tsx line 102) |
| My Work "Completed Tasks" collapsible section | ✅ Already filters `t.done` |
| Epics page line-through on done tasks | ✅ Already reads `task.done` from query data |
| Sprint board line-through on done tasks | ✅ Already renders correctly |

---

<br/>

---

# Implementation Plan: Sprint Actual Hours, Variance & Efficiency

**Status:** ✅ Implemented — 2026-06-08  
**Last updated:** 2026-06-08

---

## Goal

Let the team record **actual hours worked** (per employee, per task) at **end of sprint**, then show **variance** and **efficiency** on the **Overview** page (`/overview` → `ProjectOverview`).

We are **not** building velocity. We **are** building estimation feedback for retros and sprint review.

---

## Terminology (product + data model)

| Term | Meaning in SprintFlow |
|------|------------------------|
| **Planned hours** | Existing `TaskAssignment.hours` — estimate at sprint planning |
| **Actual hours** | New field — time the assignee reports they spent on that task (entered at sprint end) |
| **Variance** | How far actuals differ from plan (hours and %) |
| **Efficiency** | “Beat the estimate” ratio — values above 100% mean faster than planned |

> **Naming note:** Workflow copy may say “Log actual hours.” We do **not** implement live “active/focus time” timers in v1 — only end-of-sprint manual entry, same grain as Jira “Log work” without Tempo.

---

## Metrics (formulas)

All sprint-level rollups use **completed tasks only** (`task.done === true`) where the assignee has both planned and actual recorded.

### Per assignment (one person on one task)

```text
planned   = TaskAssignment.hours
actual    = TaskAssignment.actualHours   // new, nullable until logged

varianceHours = planned − actual
              // +1.5 → finished 1.5h under plan
              // −2.0 → took 2h longer than plan

variancePct = (planned − actual) / planned × 100    // when planned > 0

efficiencyPct = planned / actual × 100              // “beat the estimate”
              // planned 3h, actual 1.5h → 200%
              // planned 3h, actual 3h   → 100%
              // planned 3h, actual 6h   → 50%
```

Guardrails:

- If `actual` is null/0 → exclude from sprint aggregates (show “—” or “Not logged”).
- If `planned` is 0 → skip variance/efficiency for that row (no divide-by-zero).

### Per sprint (Overview card)

Weight by planned hours on **done** assignments — do **not** average per-task percentages.

```text
ΣPlannedDone = Σ planned  (done tasks, assignments with actualHours set)
ΣActualDone  = Σ actualHours

varianceHours     = ΣPlannedDone − ΣActualDone
variancePct       = (ΣPlannedDone − ΣActualDone) / ΣPlannedDone × 100
efficiencyPct     = ΣPlannedDone / ΣActualDone × 100
```

Example: tasks A (3h→1.5h) + B (5h→6h) on done work:

- ΣPlanned = 8h, ΣActual = 7.5h  
- Variance = +0.5h (+6.25%)  
- Efficiency = 106.25%

---

## Data model

### Phase A — Schema

**File:** `packages/db/prisma/schema.prisma`

Add to `TaskAssignment`:

```prisma
actualHours Decimal? @db.Decimal(8, 2)  // null until end-of-sprint entry
```

Migration name suggestion: `add_task_assignment_actual_hours`.

Keep planned on `hours`; do **not** overload one column for both.

---

## Workflow (how the team uses it)

1. **Sprint planning** — unchanged; set planned hours on owner chips / task drawer (`hours`).
2. **During sprint** — no time logging required (reduces overhead).
3. **End of sprint** (or when marking sprint `COMPLETED`):
   - Team opens the sprint board (`/sprints/:id`) or a dedicated **“Log sprint actuals”** panel.
   - For each **done** task, each assigned member enters **actual hours** on their assignment row.
   - Optional: prompt if sprint status moves to `COMPLETED` and any done assignment is missing `actualHours`.
4. **Overview** — variance and efficiency appear on each sprint card; completed sprints show final numbers; active sprints show partial data if some actuals are already entered.

### UX surfaces for entry (v1)

| Surface | Purpose |
|---------|---------|
| `SprintBoardView` owner chip popover | Add **Actual** field beside **Planned** |
| `ScrumTaskDrawer` assignments section | Same dual fields |
| Sprint header (optional) | “Log actuals” CTA + progress: “12/15 assignments logged” |

### Policy (document in README or team guide when shipped)

- Actuals are for **estimation improvement**, not performance ranking.
- Only the assignee (or project lead) may edit their assignment’s `actualHours`.
- Missing actuals → sprint efficiency/variance shows “Incomplete” badge, not a misleading 100%.

---

## API changes

### Phase B — Assignment actuals

**Files:**

- `packages/shared/src/schemas/task.ts` — extend or add `UpdateActualHoursSchema`:
  ```ts
  actualHours: z.number().min(0).max(1000)
  ```
- `apps/api/src/modules/tasks/tasks.service.ts` — `updateActualHours(taskId, workspaceId, actorId, projectMemberId, actualHours)` with assignee/role check
- `apps/api/src/modules/tasks/tasks.routes.ts` — `PATCH /tasks/:taskId/assignments/:projectMemberId/actual` (or extend upsert with optional `actualHours` only when explicitly sent)

**Serialization:** `serializeAssignments` → include `actualHours: number | null`.

### Phase C — Overview aggregations

**File:** `apps/api/src/modules/projects/projects.routes.ts` — project overview handler (~line 118, `sprintHealth` map)

Extend each sprint health object:

```ts
{
  // existing: plannedHours, budgetHours, bufferHours, ...
  actualHours: number,           // Σ actualHours on done assignments (logged only)
  varianceHours: number | null,  // null if no logged actuals on done work
  variancePct: number | null,
  efficiencyPct: number | null,
  actualsLoggedCount: number,    // assignments with actualHours set on done tasks
  actualsExpectedCount: number,  // assignments on done tasks with planned > 0
}
```

**File:** `packages/shared/src/types.ts` — extend `SprintHealthDto` with the same fields.

---

## Frontend changes

### Phase D — Entry UI

**Files:**

- `apps/web/src/components/scrum/SprintBoardView.tsx` — `OwnerChips`: Planned + Actual inputs; chip label e.g. `3p / 1.5a`
- `apps/web/src/components/scrum/ScrumTaskDrawer.tsx` — assignment section
- `apps/web/src/lib/api/tasks.ts` — `updateActualHours(...)`

Invalidate: `project-overview`, `sprint-board`, `project-dashboard`, `my-work`.

### Phase E — Overview display (primary deliverable)

**File:** `apps/web/src/components/overview/ProjectOverview.tsx`

On each `SprintCard` (after capacity / completion sections), add **Estimation Performance**:

| Display | Source |
|---------|--------|
| `+0.5h variance (+6%)` | `varianceHours`, `variancePct` |
| `106% efficiency` | `efficiencyPct` |
| `Actual: 7.5h / 8h planned` | `actualHours`, `ΣPlannedDone` |
| Badge: `3 assignments not logged` | `actualsExpectedCount − actualsLoggedCount` |

Color hints (match existing dashboard patterns):

- Efficiency ≥ 100% → emerald (at or ahead of estimate)
- Efficiency 80–99% → amber (slightly over)
- Efficiency < 80% → rose (significantly over)

Optional project-level summary row in Overview header metrics (not required for v1):

- Rolling average efficiency across last 3 **completed** sprints.

**Out of scope for v1:** `/dashboard` executive page, burndown chart, time-entry history by date, live timers.

---

## Implementation order

| Step | Area | Effort |
|------|------|--------|
| **1** | Prisma migration + shared types/schemas | ~30 min |
| **2** | API: update actual hours + auth | ~45 min |
| **3** | Overview API: variance/efficiency aggregates | ~45 min |
| **4** | Sprint board + task drawer entry UI | ~1.5 h |
| **5** | Overview `SprintCard` metrics display | ~1 h |
| **6** | Seed data: sample actuals on 1–2 completed assignments | ~15 min |
| **7** | Manual test: end-of-sprint flow → Overview numbers | ~30 min |

**Total estimated effort:** ~5 h.

---

## Verification checklist (before marking done)

- [ ] Done task with planned 3h, actual 1.5h → Overview shows **+1.5h**, **+50% variance**, **200% efficiency**
- [ ] Done task with no actual → excluded from aggregates; badge shows incomplete logging
- [ ] In-progress task actuals (if entered early) do **not** affect sprint efficiency until `done`
- [ ] Member A’s actual on a task does not appear on Member B’s assignment row
- [ ] Re-fetch Overview after logging actuals on sprint board

---

## Explicit non-goals (v1)

- Velocity (story points or hours delivered per sprint)
- Active/focus-time tracking or stopwatch UI
- Per-day worklog / burndown chart
- Payroll, billing, or individual performance dashboards
- Requiring actuals before marking a single task done (only encouraged at sprint close)

---

*Implemented 2026-06-08, revised 2026-06-08: pivoted from per-task actuals to per-sprint per-member actuals (`SprintMemberActual` model). Both TypeScript projects compile clean.*

---

<br/>

---

# Implementation Plan: Real Auth, Roles & Permissions (RBAC)

**Status:** Planned — not implemented  
**Last updated:** 2026-06-13 (hardened from 2026-06-12 draft against live codebase)  
**Depends on:** None (can run in parallel with Cross-View Task State Sync — see merge hotspots below)  
**Blocks:** Production deploy with real `@geti.education` accounts

---

## Goal

Replace the current “any workspace MEMBER can mutate anything” model with a **three-tier role system** that matches how GETI works. **Shared UI for all roles** — same routes, same dashboards. Only **permissions** differ (enforced at the API; UI only hides affordances). Super Admin gets one extra page: **Admin Settings** (`/settings/admin`).

| Tier | Product name | Data model | Headcount |
|------|--------------|------------|-----------|
| 1 | **Super Admin** | `GlobalRole.SUPER_ADMIN` | ~3 fixed emails (env-seeded) |
| 2 | **Team Admin (Lead)** | `ProjectRole.LEAD` per project | Assigned/removed by Super Admin |
| 3 | **Member** | `GlobalRole.MEMBER` + `ProjectRole.MEMBER` | Everyone else (`@geti.education`, JIT on first login) |

> **Why this mapping (validated against Phase 12 + code):** Today `GlobalRole.ADMIN` is the "manager" role. The codebase deliberately **excludes** `ADMIN` users from project rosters, assignee lists, and capacity math via `where: { user: { role: { not: 'ADMIN' } } }` (9 sites, see migration surface). That is exactly the behaviour we want for **Super Admin** (a company-wide overseer who is not an assignee), and exactly the behaviour we **do not** want for a **Lead** (who is a real team member who gets tasks). Therefore: **Super Admin = the elevated global role; Lead = a project-scoped role on a normal member.** Do **not** reuse `GlobalRole.ADMIN` for leads.

---

## Glossary (product term ↔ schema field)

| Product term | Schema / code | Notes |
|--------------|---------------|-------|
| Super Admin | `User.role = SUPER_ADMIN` | Global. Env-seeded. Bypasses all project checks. Excluded from rosters/assignees. |
| Team / Lead's scope | `Project` | One `Project` per team (D1). Lead powers are project-scoped. |
| Lead | `ProjectMember.role = LEAD` | Per project. **Currently unwired** — `assertProjectAccess` ignores `ProjectRole` (see below). |
| Member | `User.role = MEMBER` + `ProjectMember.role = MEMBER` | Default. |
| Planned hours | `TaskAssignment.hours` (Decimal) | Per task per project member. |
| Actual hours | `SprintMemberActual.actualHours` (Decimal) | **Per sprint per member — NOT per task.** Unique on `(sprintId, projectMemberId)`. |
| Capacity | `ProjectMember.hoursPerDay` (Float) | Lead/super-admin editable. |
| Workspace membership | `WorkspaceMember.role` (`OWNER`/`ADMIN`/`MEMBER`/`VIEWER`) | **Tenancy layer — kept, see WorkspaceRole decision.** |

---

## ⚠️ Codebase reality corrections (the draft was wrong on these)

These were verified by reading the code on 2026-06-13. The original draft contained stale assumptions.

1. **Actuals route is wrong in the draft.** There is **no** `PATCH /sprints/:id/members/:pmId/actual` and **no** `tasks.updateActualHours`. The real routes are:
   - `PUT /sprints/:sprintId/actuals/:projectMemberId` (upsert) — `sprints.routes.ts:354`
   - `DELETE /sprints/:sprintId/actuals/:projectMemberId` — `sprints.routes.ts:375`
   Both currently guard with `assertWsAccess(req, 'MEMBER')`. The matrix and Phase B below use the **correct** routes.
2. **`assertProjectAccess` does NOT check `ProjectRole`** (`projects.routes.ts:47`). It only verifies *workspace* membership at a workspace minRole. So `ProjectRole.LEAD` is genuinely unused for authorization today — Phase B must add real `ProjectMember.role` reads, not just call the existing helper.
3. **Boards use inline membership checks, not `assertWorkspaceMember`** (`boards.routes.ts` ~116, ~157, ~211 — add/delete/reorder column). Phase B must replace these inline checks, and there is a **DELETE column** route the draft omitted.
4. **Comment-delete already uses workspace ADMIN/OWNER** (`tasks.service.ts:408`), not project role. This becomes `task:comment_delete` in the engine.
5. **Env is not Zod.** `env.ts` uses hand-rolled `req()` / `opt()` helpers. Match that pattern — do not introduce Zod here.
6. **Login returns `{ tokens, user }` from the service**, and the controller responds `{ accessToken, user }` and sets the refresh cookie (`auth.controller.ts:64-67`). `mustChangePassword` must be threaded through the controller response, not the service tuple.
7. **No test infrastructure exists.** Root `test` script runs `turbo run test` but there are zero test files and no vitest/jest config. See Testing strategy.
8. **`role: { not: 'ADMIN' }` appears in 9 query sites** that exclude the manager from rosters. After migration these must become `{ not: 'SUPER_ADMIN' }` or the new Super Admin will incorrectly show up as an assignee. This is the largest single chunk of Phase B work and the draft underestimated it.

---

## Problem statement (current gaps)

| Area | Today | Required |
|------|-------|----------|
| Global roles | `ADMIN` \| `MEMBER` only | Add `SUPER_ADMIN`; retire `ADMIN` as the manager proxy |
| Team lead | `ProjectRole.LEAD` exists but **`assertProjectAccess` ignores it** | LEAD = edit assignments, hours, sprint/epic structure for **their project** |
| Task/sprint API | `assertWorkspaceMember(..., 'MEMBER')` on all mutations → any member can do anything | Action-based checks: super admin vs lead vs assigned member vs other |
| My Work | `isAdmin = user.role === 'ADMIN'` (`projects.routes.ts:821`) → team view for **every** global admin | `isLead` per project → team view only where user is `LEAD` (or super admin) |
| Login | Seed/manual accounts only; `login()` requires `status: ACTIVE` | Domain allowlist + shared default password + JIT provision |
| First login | No forced password change | `mustChangePassword` flag → blocking change-password page |
| Admin management | Invite + claim only | Super Admin dashboard: promote/demote leads, list users, deactivate, reset password |

---

## Architecture decisions (defaults for implementation)

Implement against these. Flag in the PR if any proves wrong. (Owner-confirm items are listed separately at the end — keep that list ≤5.)

| # | Decision | Default |
|---|----------|---------|
| D1 | What is a “team”? | **One `Project` per team.** Lead powers are project-scoped. |
| D2 | Super Admin emails | Env `SUPER_ADMIN_EMAILS` (comma-separated). Never committed. |
| D3 | Member provisioning | `@geti.education` (+ future via `ALLOWED_EMAIL_DOMAINS`) → JIT user on first login. |
| D4 | Default password | Env `DEFAULT_MEMBER_PASSWORD`. Super admins **cannot** authenticate with it. |
| D5 | First login | **Force password change** (`mustChangePassword: true` until changed). |
| D6 | Excel import | **Leads + Super Admin** can import/rollback. |
| D7 | Cross-team visibility | **Read-all** on Flow/sprint/epics/backlog. **Write** only on assigned tasks (member) or own project (lead). |
| D8 | Multi-project users | Supported. My Work aggregates the opened project; lead view only where `LEAD`. |
| D9 | Demoting a lead | Immediate loss of edit powers; historical assignments/actuals remain. |
| D10 | Migrate `GlobalRole.ADMIN` | Data-migrate existing `ADMIN` rows → `SUPER_ADMIN`; flip all 9 `{ not: 'ADMIN' }` filters → `{ not: 'SUPER_ADMIN' }`. **Leave the `ADMIN` enum value orphaned** (Postgres enum-value removal requires a type swap — not worth the risk; simplicity wins). Code stops referencing it. |
| D11 | JIT workspace join | `DEFAULT_WORKSPACE_SLUG` if set; else the single workspace if exactly one exists; else hard error (ambiguous). |
| D12 | JIT project join | If `DEFAULT_PROJECT_ID` set → auto-add as `ProjectMember(MEMBER)`. Else **no** project membership; super admin/lead adds them later. New member then sees full Flow (read) but empty My Work until added. |
| D13 | JIT name | Derived from email local-part: split on `.`/`_`, title-case each token. Editable later. |
| D14 | JIT status | `UserStatus.ACTIVE` immediately (domain-gated internal tool). `mustChangePassword: true`. |

---

## WorkspaceRole decision (resolving the three-role-system conflict)

**Keep `WorkspaceRole`. It is the tenancy/membership layer and is actively used** (`assertWorkspaceMember` rank ladder, invite endpoint, workspace routes, comment-delete). It is **not** vestigial. We do **not** add a fourth source of truth, and we do **not** overload it for the product tiers.

**Single resolution order — implemented once in `permissions.ts`, used everywhere:**

```
1. SUPER_ADMIN (User.role)        → allow (full bypass)
2. else require WorkspaceMember   → else 403 (tenancy gate, unchanged)
3. ProjectRole.LEAD on the target project → allow lead-scoped actions
4. ProjectMember.role MEMBER + assigned to the target task → allow workflow-only
5. else → deny (read still allowed for view actions)
```

Mapping rules:
- **Super admin** is seeded as `WorkspaceMember(OWNER)` so existing workspace-level gates (invite, comment-delete) keep working without rewrites, **and** `User.role = SUPER_ADMIN` for the bypass.
- `requireWorkspaceRole('ADMIN')` on invite (`users.routes.ts:29`) → replace with `requireSuperAdmin`. Workspace `OWNER`/`ADMIN` ranks remain for the membership ladder but are no longer the product-facing admin tier.
- Comment-delete’s `ADMIN || OWNER` check migrates into `assertCan('task:comment_delete')`.

---

## Permission resolution algorithm (pseudocode)

```ts
async function can(userId, action, ctx): Promise<boolean> {
  const user = await getUser(userId);                  // 1 query (cache on req)
  if (user.role === 'SUPER_ADMIN') return true;        // global bypass

  // every action requires workspace membership (tenancy)
  const ws = await getWorkspaceMembership(userId, ctx.workspaceId);
  if (!ws) return false;

  switch (action) {
    // read — any workspace member, any project (D7 read-all)
    case 'task:view': case 'project:view': return true;

    // lead-scoped structural / meta / hours actions
    case 'task:create': case 'task:delete': case 'task:edit_meta':
    case 'task:assign':                                  // planned hours
    case 'sprint:write': case 'epic:write': case 'import:write':
    case 'project:edit': case 'capacity:edit':
    case 'sprintactual:write':                           // SprintMemberActual (others)
      return await isLeadOnProject(userId, ctx.projectId);

    // workflow — assigned member, their lead, (super admin already returned)
    case 'task:workflow':                                // move/done/blocked/deferred
      return (await isAssignedToTask(userId, ctx.taskId))
          || (await isLeadOnProject(userId, ctx.projectId));

    case 'task:comment': return true;                    // any member
    case 'task:comment_delete':                          // author OR lead OR ws ADMIN/OWNER
      return ctx.isAuthor
          || (await isLeadOnProject(userId, ctx.projectId))
          || ws.role === 'ADMIN' || ws.role === 'OWNER';

    // super-admin-only never reaches here (returned true above); members/leads denied
    case 'project:delete': case 'project:manage_members':
    case 'lead:manage': case 'user:manage': return false;

    default: return false;
  }
}
async function assertCan(...) { if (!await can(...)) throw new ForbiddenError(action); }
```

Helpers (each O(1), indexed):
- `isSuperAdmin(userId)` → `user.role === 'SUPER_ADMIN'`
- `getProjectMembership(userId, projectId)` → `ProjectMember | null` (unique `[projectId, userId]`)
- `isLeadOnProject(userId, projectId)` → `pm?.role === 'LEAD'`
- `isAssignedToTask(userId, taskId)` → join `TaskAssignment` → `ProjectMember.userId === userId`

**Task → project resolution:** `Task.projectId` is `String?` (legacy nullable, `schema.prisma:310`). When null, resolve via the task’s sprint, then board workspace; if still unresolved, treat as workspace-scoped and require workspace MEMBER. Document the fallback in a code comment.

**Field-split for `PATCH /tasks/:id`:** the same endpoint serves meta edits and workflow toggles. In `updateTask`, partition the payload: keys `{ done, blocked, blockedReason, deferred, deferredReason, columnId, position }` require `task:workflow`; **any other key** present requires `task:edit_meta`. A member sending only workflow keys on an assigned task → 200; sending `title`/`priority`/etc. → 403.

---

## Role → permission matrix

### Task & sprint actions

| Action | Super Admin | Lead (same project) | Member (assigned) | Member (not assigned) |
|--------|:-----------:|:-------------------:|:-----------------:|:---------------------:|
| View all (Flow, backlog, sprint, epics) | ✓ | ✓ | ✓ | ✓ |
| Move column / workflow (`task:workflow`) | ✓ | ✓ | ✓ | ✗ |
| Toggle done / blocked / deferred | ✓ | ✓ | ✓ | ✗ |
| Edit title, priority, sprint, epic, notes (`task:edit_meta`) | ✓ | ✓ | ✗ | ✗ |
| Create / delete task | ✓ | ✓ | ✗ | ✗ |
| Set assignment **planned** hours (`task:assign`) | ✓ | ✓ | ✗ | ✗ |
| Set **sprint actual** hours for others | ✓ | ✓ | ✗ | ✗ |
| Set **own** sprint actual hours | ✓ | ✓ | **see OQ-1** | ✗ |
| Edit `hoursPerDay` capacity | ✓ | ✓ | ✗ | ✗ |
| Add comment | ✓ | ✓ | ✓ | ✓ |
| Delete own comment | ✓ | ✓ | ✓ | ✓ |
| Delete others' comments | ✓ | ✓ | ✗ | ✗ |

### Structural / admin actions

| Action | Super Admin | Lead | Member |
|--------|:-----------:|:----:|:------:|
| Excel import / rollback | ✓ | ✓ | ✗ |
| Create / edit / delete sprints & epics | ✓ | ✓ | ✗ |
| Edit project settings | ✓ | ✓ | ✗ |
| Add/reorder/delete board columns | ✓ | ✓ | ✗ |
| Delete project | ✓ | ✗ | ✗ |
| Add/remove project members | ✓ | ✗ | ✗ |
| Promote/demote leads | ✓ | ✗ | ✗ |
| Deactivate user / reset password | ✓ | ✗ | ✗ |
| Admin settings page | ✓ | ✗ | ✗ |

### My Work page

| Role | Behavior |
|------|----------|
| Member | Own assignments only (current non-admin path). |
| Lead | **Team Work** section for projects where `ProjectRole.LEAD` (`allMembersWork` scoped to that project). |
| Super Admin | Team Work on any project opened (keep the existing stub-member DTO; no personal assignments). |

---

## Endpoint × role map (every mutating route)

| Endpoint | File | Super | Lead | Member (assigned) | Member (other) |
|----------|------|:-----:|:----:|:-----------------:|:--------------:|
| `POST /tasks` | tasks.routes | ✓ | ✓ | ✗ | ✗ |
| `PATCH /tasks/:id` (meta keys) | tasks.routes | ✓ | ✓ | ✗ | ✗ |
| `PATCH /tasks/:id` (workflow keys only) | tasks.routes | ✓ | ✓ | ✓ | ✗ |
| `PATCH /tasks/:id/move` | tasks.routes | ✓ | ✓ | ✓ | ✗ |
| `DELETE /tasks/:id` | tasks.routes | ✓ | ✓ | ✗ | ✗ |
| `PUT /tasks/:id/assignments/:pmId` | tasks.routes | ✓ | ✓ | ✗ | ✗ |
| `DELETE /tasks/:id/assignments/:pmId` | tasks.routes | ✓ | ✓ | ✗ | ✗ |
| `POST /tasks/:id/comments` | tasks.routes | ✓ | ✓ | ✓ | ✓ |
| `PATCH /tasks/:id/comments/:cid` | tasks.routes | ✓ | author | author | author |
| `DELETE /tasks/:id/comments/:cid` | tasks.routes | ✓ | ✓ | author only | author only |
| `POST /sprints` | sprints.routes | ✓ | ✓ | ✗ | ✗ |
| `PATCH /sprints/:id` | sprints.routes | ✓ | ✓ | ✗ | ✗ |
| `DELETE /sprints/:id` | sprints.routes | ✓ | ✓ | ✗ | ✗ |
| `PUT /sprints/:id/actuals/:pmId` | sprints.routes | ✓ | ✓ | OQ-1 | ✗ |
| `DELETE /sprints/:id/actuals/:pmId` | sprints.routes | ✓ | ✓ | OQ-1 | ✗ |
| `POST /imports`, `/:id/commit`, `/:id/rollback` | import.routes | ✓ | ✓ | ✗ | ✗ |
| `POST/PATCH/DELETE /projects/:id/epics[...]` | projects.routes | ✓ | ✓ | ✗ | ✗ |
| `PATCH /projects/:id` | projects.routes | ✓ | ✓ | ✗ | ✗ |
| `DELETE /projects/:id` | projects.routes | ✓ | ✗ | ✗ | ✗ |
| `PATCH /projects/:id/members/:mid` | projects.routes | ✓ | ✗ | ✗ | ✗ |
| `POST /boards/:id/columns`, reorder, delete | boards.routes | ✓ | ✓ | ✗ | ✗ |
| `GET /projects/:id/my-work` | projects.routes | ✓ | ✓ | ✓ | ✓ |
| `POST /workspace/:wid/invite` | users.routes | ✓ | ✗ | ✗ | ✗ |
| `GET/PATCH/POST /admin/users[...]` | admin (new) | ✓ | ✗ | ✗ | ✗ |

---

## Provisioning flow (first login → membership)

```
POST /auth/login { email, password }
        │
        ▼
 normalize email (lowercase, trim)
        │
   user exists? ──no──► domain ∈ ALLOWED_EMAIL_DOMAINS? ──no──► 401
        │                          │yes
        │yes               password === DEFAULT_MEMBER_PASSWORD? ──no──► 401
        │                          │yes
        │                  JIT: create User(MEMBER, ACTIVE, mustChangePassword=true,
        │                       name=derive(email))
        │                  + WorkspaceMember(MEMBER) on DEFAULT_WORKSPACE_SLUG/only-ws
        │                  + ProjectMember(MEMBER) on DEFAULT_PROJECT_ID (if set)  [D12]
        ▼                          │
 status === ACTIVE? ──no──► 401    │
        │yes                       │
 SUPER_ADMIN && pwd==DEFAULT? ─yes─► 401  (D4: super admins never use shared pwd)
        │no                        │
 verify argon2 password ──fail──► 401
        │ ok                       │
        ▼◄─────────────────────────┘
 issue tokens; respond { accessToken, user, mustChangePassword }
        │
 mustChangePassword? ──yes──► web routes to blocking /settings/password
        │no
        ▼
 normal app
```

Notes: JIT runs **inside** `auth.service.login` before the `status: ACTIVE` check the service currently enforces (so a freshly-created user passes). The controller adds `mustChangePassword` to the JSON. `changePassword` clears the flag and (per existing code) revokes all refresh tokens.

---

## Data model changes

### Phase A — Schema (`packages/db/prisma/schema.prisma`)

```prisma
enum GlobalRole {
  SUPER_ADMIN  // new — elevated, company-wide; excluded from rosters/assignees
  ADMIN        // ORPHANED post-migration: data-migrated to SUPER_ADMIN, no code refs.
               // Not dropped (Postgres enum removal needs a type swap — not worth it).
  MEMBER
}

model User {
  // ...existing...
  mustChangePassword Boolean @default(false)
}
```

**Migration `add_super_admin_and_must_change_password`:**
1. `ALTER TYPE "GlobalRole" ADD VALUE 'SUPER_ADMIN';` (must be its own committed step before it can be used in data — Prisma generates this; if it complains about using a new value in the same migration, split into two migrations).
2. `UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';`
3. Add `mustChangePassword BOOLEAN NOT NULL DEFAULT false`.

### Phase A — Env (`apps/api/src/lib/env.ts`, match existing `req()`/`opt()` style)

| Var | Required | Purpose |
|-----|----------|---------|
| `ALLOWED_EMAIL_DOMAINS` | prod yes | e.g. `geti.education` (comma-separated, lowercased) |
| `DEFAULT_MEMBER_PASSWORD` | prod yes | Shared initial password for JIT members |
| `SUPER_ADMIN_EMAILS` | prod yes | Comma-separated; seed upserts as `SUPER_ADMIN` |
| `SEED_SUPER_ADMIN_PASSWORD` | prod yes | Strong password for seeded super admins (reuse seed weak-password guard) |
| `DEFAULT_WORKSPACE_SLUG` | optional | JIT workspace join (D11) |
| `DEFAULT_PROJECT_ID` | optional | JIT project auto-join (D12) |

Update `.env.example` with placeholders only (no real values).

### Phase A — Shared (`packages/shared/src`)

- `enums.ts`: add `SUPER_ADMIN: 'SUPER_ADMIN'` to `GlobalRole`.
- `types.ts`:
  - `UserDto` → add `mustChangePassword?: boolean`.
  - `MyWorkDto.isAdmin` → **rename to `isLead: boolean`**. Migrate the single web consumer (`my-work/page.tsx`) in the **same PR**; no deprecated alias (only one reader — simpler).
  - Add `getMe`/auth response field `projectMemberships: { projectId: string; role: ProjectRole }[]`.

---

## Permission engine (`apps/api/src/lib/permissions.ts`) — Phase B

New central module. After this lands, **no route may contain `req.user.role === ...` or `role: { not: 'ADMIN' }`** outside `permissions.ts` and the roster-filter helper.

Export: `TaskAction`/`ProjectAction` unions, `getActorContext(userId, {projectId?, taskId?, workspaceId})` (memoize on `req`), `can(...)`, `assertCan(...)`, and the helpers above. Also export `rosterExclusionWhere = { role: { not: 'SUPER_ADMIN' } }` so the 9 filter sites import one constant instead of hardcoding.

**Wire-in (exact sites):**

| File | Mutations to guard | Current check to replace |
|------|--------------------|--------------------------|
| `tasks.service.ts` | `createTask` (112), `updateTask` (170, field-split), `moveTask` (247), `deleteTask` (294), `upsertAssignment` (318), `removeAssignment` (339), `createComment` (354), `updateComment` (381), `deleteComment` (400→engine) | `assertTaskAccess(...,'MEMBER')` |
| `sprints.routes.ts` | create (225), update (280), delete (328), actuals PUT (354), actuals DELETE (375) | `assertWsAccess(...,'MEMBER')` |
| `projects.routes.ts` | update (457), delete (483), member patch (506), epics (615/654/691) | `assertProjectAccess(...,'MEMBER')` — **add real LEAD read** |
| `import.service.ts` | upload (16), commit (243), rollback (554) | `assertWorkspaceMember(...,'MEMBER'/'VIEWER')` |
| `boards.routes.ts` | add (116), delete (157), reorder (211) — **replace inline `members.some(...)`** | inline membership check |
| `users.routes.ts` | invite (29) | `requireWorkspaceRole('ADMIN')` → `requireSuperAdmin` |

**Roster-filter migration (9 sites):** flip `{ not: 'ADMIN' }` → `rosterExclusionWhere` in `users.service.ts:62`, `import.service.ts:351`, `sprints.routes.ts:80`, `projects.routes.ts:127, 356, 833, 996, 1054`, and the my-work stub/role check at `720`, `821`, `890`.

**Middleware (`auth.ts`):** add `requireSuperAdmin`; change `requireGlobalRole` signature to accept `'SUPER_ADMIN'`. Keep `requireWorkspaceRole` for tenancy.

---

## Auth & provisioning — Phase C

**`auth.service.ts`** — extend `login()` per the provisioning diagram; add a `provisionJitUser(email)` helper. Keep the `status: ACTIVE` gate (JIT user is created ACTIVE so it passes).
**`auth.controller.ts`** — add `mustChangePassword` to the login JSON (`:67`) and `getMe` JSON (`:102`); enrich `serializeUserWithMemberships` (or a new serializer) with `projectMemberships`.
**`changePassword`** — already revokes refresh tokens; additionally set `mustChangePassword = false`.
**`seed.ts`** — upsert each `SUPER_ADMIN_EMAILS` entry as `SUPER_ADMIN` + `WorkspaceMember(OWNER)` using `SEED_SUPER_ADMIN_PASSWORD` (reuse existing weak-password guard, lines 18-32); keep dev `admin@sprintflow.local` mapping to `SUPER_ADMIN` for backward compat; gate `iris@`/`nate@` demo users behind non-production.

**Super Admin API (new module `apps/api/src/modules/admin/`, mounted `/api/v1/admin`, all `requireSuperAdmin`):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List workspace users + their project roles |
| PATCH | `/admin/users/:userId/lead` | Body `{ projectId, role: 'LEAD'\|'MEMBER' }` → upsert `ProjectMember` |
| PATCH | `/admin/users/:userId/status` | Body `{ status }` |
| POST | `/admin/users/:userId/reset-password` | Set hash to `DEFAULT_MEMBER_PASSWORD` + `mustChangePassword: true`; return nothing secret |

**Audit:** add `ActivityAction` enum values `USER_ROLE_CHANGED`, `USER_DEACTIVATED`, `PASSWORD_RESET`, `USER_PROVISIONED` (schema enum currently ends at `PROJECT_CREATED`, line 83) and write to `ActivityLog` on each admin action.

---

## Frontend — Phase D

**Auth gate:**
- `lib/api/auth.ts` `LoginResponse` + `getMe` → carry `mustChangePassword`, `projectMemberships`.
- `store/auth.store.ts` → store `mustChangePassword` + `projectMemberships`.
- `app/(app)/layout.tsx` → after hydration, if `mustChangePassword`, `router.replace('/settings/password')` and block children.
- **New** `app/(app)/settings/password/page.tsx` — blocking change-password form.

**`usePermissions` hook (`apps/web/src/hooks/usePermissions.ts`):** mirrors the engine for UI hiding only.
```ts
{ isSuperAdmin, isLead(projectId), can(action, projectId?, isAssigned?) }
```

**Gate sites (hide/disable only — API still enforces):**

| File | Gated |
|------|-------|
| `board/TaskDetailDrawer.tsx` | delete, meta fields, assignment hours |
| `board/Board.tsx` | drag enabled only when assigned/lead/super (⚠ merge hotspot) |
| `scrum/SprintBoardView.tsx` | owner-chip hour edits, sprint actuals, non-assigned done toggle (⚠ hotspot) |
| `scrum/ScrumTaskDrawer.tsx` | same (⚠ hotspot) |
| `scrum/InlineAddTask.tsx` | create (lead+) |
| `app/(app)/my-work/page.tsx` | `isLead` instead of `isAdmin` (rename field) |
| `layout/Sidebar.tsx` | Admin Settings link (super only); hide Import for members |
| import wizard route + `onboarding/page.tsx` | lead/super only |

**Super Admin settings (`app/(app)/settings/admin/page.tsx`)** + client `lib/api/admin.ts`: user table (name/email/status/project roles) with promote-to-lead (project picker), demote, deactivate, reset-password actions.

**my-work API change (`projects.routes.ts` my-work handler ~710-890):** `isAdmin` → `isLead = isSuperAdmin || projectMember?.role === 'LEAD'`; gate `allMembersWork` on `isLead` scoped to that project; keep the super-admin stub member DTO (update its `role` label).

---

## Testing strategy

No test runner exists. **Do not build full test infra in this work** (simplicity). Instead:

1. **Phase B gate — committed curl matrix.** Add `apps/api/scripts/rbac-smoke.sh` that logs in as a seeded super admin, a seeded lead, and a JIT member, then asserts the Phase B checklist status codes. Run it against a local stack; paste results into the commit body.
2. **Optional (flag to owner, not in critical path):** if the team wants regression coverage, add `vitest` + `supertest` to `apps/api` with one `permissions.test.ts` exercising `can()` against an in-memory actor — but this is the only place a unit test pays off, since `can()` is pure given its loaders.

---

## Implementation order & phase dependencies

Execute **strictly in phase order**; each gate must pass before the next. A→B→C→D→E is a hard chain (B needs A’s enum; C needs B’s `requireSuperAdmin`; D needs C’s `/auth/me` shape; E hardens D).

| Phase | Scope | Revised effort | Gate |
|-------|-------|----------------|------|
| **A** | Schema + migration + shared enums/types + env + seed | ~2.5 h | `pnpm db:migrate` applies; `tsc --noEmit` clean in api/web/shared/db |
| **B** | `permissions.ts` + wire ~25 mutation sites + flip 9 roster filters + boards inline + field-split | **~6 h** (was 4 — roster-filter + boards surface) | `rbac-smoke.sh` matrix green |
| **C** | JIT login + mustChangePassword + admin module + `/auth/me` enrich + audit enum | ~3.5 h | Phase C checklist |
| **D** | Password page + `usePermissions` + gate 8 surfaces + admin settings page + isAdmin→isLead | ~5 h | Role walkthrough in browser |
| **E** | Audit logging wired + login rate limit + README | ~2 h | Phase E checklist |

**Total revised estimate: ~19 h** (was 14–16; the increase is real: roster-filter migration, boards inline checks, and the field-split were under-scoped).

### Phase A checklist
- [ ] Migration applies; `SUPER_ADMIN` in DB enum; existing `ADMIN` rows migrated
- [ ] `GlobalRole.SUPER_ADMIN` in shared enums; `User.mustChangePassword` in schema + `UserDto`
- [ ] `MyWorkDto.isAdmin` renamed to `isLead`
- [ ] `env.ts` reads new vars (req/opt style); `.env.example` updated
- [ ] Seed upserts super admins from env; `tsc --noEmit` clean in all 4 packages

### Phase B checklist (curl matrix)
- [ ] Member `DELETE /tasks/:id` (assigned) → 403
- [ ] Member `PUT /tasks/:id/assignments/:pmId` → 403
- [ ] Member `PATCH /tasks/:id/move` (assigned) → 200; (unassigned) → 403
- [ ] Member `PATCH /tasks/:id` workflow-only key (assigned) → 200; meta key → 403
- [ ] Member `PUT /sprints/:id/actuals/:pmId` → 403 (pending OQ-1)
- [ ] Member `POST /boards/:id/columns` → 403; Lead → 200
- [ ] Lead assignment hours on any task in project → 200; on another project → 403
- [ ] Super admin does **not** appear in `GET /projects/:id` member roster or my-work `allMembersWork`
- [ ] Lead `GET /admin/users` → 403

### Phase C checklist
- [ ] Unknown `@geti.education` + default password → user created `ACTIVE`, `mustChangePassword: true`, login 200
- [ ] Wrong domain → 401; super admin + default password → 401
- [ ] `changePassword` clears flag; login response carries flag when set
- [ ] `/auth/me` returns `projectMemberships`
- [ ] Super admin promote-to-lead writes `ProjectMember(LEAD)` + audit row

### Phase D checklist
- [ ] Member UI: no delete, no hour inputs, no import nav, drag only assigned cards
- [ ] Lead UI: team work view, hour edits, import visible, structural controls
- [ ] Super admin: `/settings/admin` reachable; promote/demote/deactivate/reset work
- [ ] `/settings/password` blocks app until changed

### Phase E checklist
- [ ] Admin actions + JIT provision written to `ActivityLog`
- [ ] Login rate-limited (`express-rate-limit`, e.g. 10/min/IP on `/auth/login`)
- [ ] README auth/roles section updated

---

## Risk register (top 5)

| # | Risk | Likelihood | Mitigation |
|---|------|:----------:|------------|
| R1 | Postgres `ADMIN`→`SUPER_ADMIN` enum/data migration fails or new value used in same migration | Med | Split into two migrations (add value, then UPDATE). Test on a DB copy. Leave `ADMIN` orphaned (D10). |
| R2 | A `{ not: 'ADMIN' }` filter is missed → Super Admin leaks into rosters/capacity | Med | Single `rosterExclusionWhere` constant; grep gate in Phase B checklist asserts roster cleanliness. |
| R3 | Merge conflict with Cross-View Task State Sync in `moveTask`, `Board.tsx`, `SprintBoardView.tsx`, `TaskDetailDrawer.tsx` | High | Land sync first **or** add RBAC guards only at function top (early `assertCan`) without touching the done-logic block. See Do-Not-Touch. |
| R4 | JIT default-password login is a shared-secret weak point | Med | `mustChangePassword` forces rotation on first login; rate-limit `/auth/login`; super admins barred from default password (D4). |
| R5 | Over-restriction breaks an existing happy path (e.g. members can no longer move their own cards) | Med | Workflow actions explicitly allowed for assigned members; full role walkthrough in Phase D gate. |

---

## Do-NOT-touch list (for the autonomous implementer)

- **Cross-View Task State Sync** plan/section and its Gap 1 done-on-move logic inside `moveTask` — add RBAC guards only at the **top** of `moveTask`; do not alter the `DONE_COL` block.
- `frontend-plan.md` (if present) — out of scope.
- The Sprint Actual Hours feature math/aggregation — only add permission gates to its write routes.
- Do **not** drop the `GlobalRole.ADMIN` enum value (D10).
- Do **not** change cookie/CORS/same-site config — no change expected for same-site deploy.

---

## Claude Code loop goal (autonomous implementation)

Use as the prompt body for `/loop` or a one-shot goal. **Do not start phase N+1 until phase N gate passes.**

```markdown
# GOAL: Implement SprintFlow RBAC (Phases A→E)

Read implementation-plan.md section "Real Auth, Roles & Permissions (RBAC)".
Implement ONE phase per iteration. After each phase:
1. Run: pnpm exec tsc --noEmit -p apps/api && pnpm exec tsc --noEmit -p apps/web \
        && pnpm exec tsc --noEmit -p packages/shared && pnpm exec tsc --noEmit -p packages/db
2. Run that phase's checklist from the plan (curl matrix for B).
3. Commit: feat(rbac): <phase> - <summary>
4. Report gate pass/fail. STOP and ask only if a checklist item fails twice or an OWNER-CONFIRM item blocks.

## Phase A — Schema & foundation
- Add SUPER_ADMIN to GlobalRole (prisma + packages/shared/src/enums.ts). Keep ADMIN value.
- Add User.mustChangePassword. Migration: add enum value (own step), UPDATE ADMIN->SUPER_ADMIN, add column.
- types.ts: UserDto.mustChangePassword; rename MyWorkDto.isAdmin -> isLead; add projectMemberships type.
- env.ts (req/opt style) + .env.example: ALLOWED_EMAIL_DOMAINS, DEFAULT_MEMBER_PASSWORD,
  SUPER_ADMIN_EMAILS, SEED_SUPER_ADMIN_PASSWORD, DEFAULT_WORKSPACE_SLUG?, DEFAULT_PROJECT_ID?
- seed.ts: upsert SUPER_ADMIN_EMAILS as SUPER_ADMIN + WorkspaceMember(OWNER); reuse weak-pwd guard.
GATE: migration applies; tsc clean in all 4 packages.

## Phase B — Permission engine
- Create apps/api/src/lib/permissions.ts: TaskAction/ProjectAction, getActorContext, can, assertCan,
  isSuperAdmin/getProjectMembership/isLeadOnProject/isAssignedToTask, export rosterExclusionWhere.
- Wire assertCan into the exact sites in the plan's wire-in table (tasks.service, sprints.routes,
  projects.routes, import.service, boards.routes — replace inline board checks).
- Field-split PATCH /tasks/:id (workflow keys vs meta keys) in updateTask.
- Flip ALL 9 { not: 'ADMIN' } filters to rosterExclusionWhere.
- middleware/auth.ts: add requireSuperAdmin; replace requireGlobalRole('ADMIN') usages.
GATE: apps/api/scripts/rbac-smoke.sh matrix; paste results in commit body.

## Phase C — Auth & admin API
- auth.service.login: domain allowlist + DEFAULT_MEMBER_PASSWORD + JIT provision (workspace + optional project).
- Super admins barred from default password. mustChangePassword threaded through controller login + getMe.
- changePassword clears mustChangePassword.
- New module apps/api/src/modules/admin (requireSuperAdmin): list users, set lead, set status, reset password.
- Add ActivityAction enum values; write audit rows. Enrich /auth/me with projectMemberships.
GATE: Phase C checklist.

## Phase D — Frontend
- LoginResponse/getMe/auth.store carry mustChangePassword + projectMemberships.
- New /settings/password (blocking) + layout redirect.
- usePermissions hook. Gate the 8 surfaces in the plan (hide only).
- New /settings/admin page + lib/api/admin.ts. my-work: isAdmin -> isLead.
GATE: Phase D checklist (manual browser notes OK).

## Phase E — Hardening
- ActivityLog wired for admin + JIT actions. express-rate-limit on /auth/login. README auth section.
GATE: Phase E checklist.

## Constraints
- API MUST enforce permissions even if UI hides controls. Match existing style; minimal diff.
- Never commit real emails/passwords. Do NOT drop GlobalRole.ADMIN enum value.
- DO NOT touch the Cross-View moveTask done-logic block — add RBAC guard at function top only.
```

---

## Owner-confirm list (≤5 — answer before prod deploy)

| # | Question | Default used in plan | Why it matters |
|---|----------|----------------------|----------------|
| **OQ-1** | Can a **member** log their **own** sprint actual hours at sprint end? The owner said "members can't edit their own hours," but the Sprint Actual Hours feature (above) says "the assignee or lead may edit actuals." **These contradict.** | **Lead-only** (honours the literal RBAC statement) | Flips `sprintactual:write` self-case; affects Phase B + SprintBoardView gating. |
| **OQ-2** | JIT project auto-join: add new members to a default project, or leave them project-less until a lead adds them? | `DEFAULT_PROJECT_ID` if set, else project-less (D12) | Determines whether a new member sees an empty vs populated My Work. |
| **OQ-3** | May **leads** delete sprints/epics and run import rollback, or is that super-admin-only? | Leads **can** (D6, D-structural) | Reverting an import is destructive; confirm leads should hold it. |
| **OQ-4** | Confirm super admins should be **excluded** from assignee/roster lists (inherit current ADMIN behaviour)? | Excluded | If super admins must also be assignable, the roster-filter flip changes. |
| **OQ-5** | Email list for `SUPER_ADMIN_EMAILS` (the ~3 addresses) — provided via env at deploy only. | Env only, never committed | Needed at deploy, not at implementation time. |

---

## Decisions log (assumptions kept vs changed from the draft)

| Draft assumption | Verdict | Rationale |
|------------------|---------|-----------|
| 3-tier mapping: SUPER_ADMIN / ProjectRole.LEAD / MEMBER | **Kept** | Validated against Phase 12 + the `{not:'ADMIN'}` roster exclusions — super admin inherits "non-assignee overseer" behaviour; lead is a real member. |
| `PATCH /sprints/:id/members/:pmId/actual` + `tasks.updateActualHours` | **Changed** | Those don't exist. Real routes are `PUT/DELETE /sprints/:id/actuals/:pmId`. Matrix corrected. |
| `assertProjectAccess` already enforces project role | **Changed** | It only checks workspace membership; LEAD is unwired. Engine must read `ProjectMember.role`. |
| Drop `GlobalRole.ADMIN` in a follow-up migration | **Changed** | Postgres enum-value removal needs a type swap — risk > reward. Orphan the value instead (D10). |
| Zod-style env validation | **Changed** | `env.ts` uses `req()`/`opt()` — match it. |
| WorkspaceRole mostly ignored | **Changed** | Kept as the tenancy layer with an explicit resolution order; super admin seeded as `WorkspaceMember(OWNER)`. |
| Boards guarded by `assertWorkspaceMember` | **Changed** | Boards use inline `members.some(...)`; Phase B replaces them and covers the DELETE-column route. |
| Keep `isAdmin` as deprecated alias | **Changed** | Only one consumer — rename to `isLead` in the same PR; no alias (simpler). |
| Phase B ~4 h | **Changed** | Raised to ~6 h: 9 roster-filter flips + boards inline + field-split were under-scoped. Total 14–16 h → ~19 h. |
| Manual curl as the only test | **Refined** | Committed `rbac-smoke.sh` as the Phase B gate; optional single `vitest` unit on `can()`. |
| 10 default decisions D1–D10 | **Kept + extended** | Added D11–D14 (JIT workspace/project/name/status) which the draft left ambiguous. |
| `mustChangePassword` returned by service | **Changed** | Service returns `{tokens,user}`; flag must be added in the controller response. |

---

*Hardened 2026-06-13 against the live codebase. Autonomous implementation goal: `.claude/goals/implement-rbac.md` (run with `/goal @.claude/goals/implement-rbac.md`). Kill switch: `touch .claude/goals/STOP`.*
