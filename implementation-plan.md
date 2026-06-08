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
