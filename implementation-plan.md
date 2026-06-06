---

# Implementation Plan: Cross-View Task State Sync

**Status:** Planned — not implemented  
**Last updated:** 2026-06-04

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

*Say the word when ready to implement.*
