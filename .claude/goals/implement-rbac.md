# GOAL: Implement SprintFlow RBAC (Phases A → E)

**Status:** ACTIVE  
**Created:** 2026-06-13  
**Source of truth:** `implementation-plan.md` → section **"Real Auth, Roles & Permissions (RBAC)"** (starts ~line 384)  
**Repo:** `/home/mrstark/Documents/Repos/SprintFlow`  
**Completion promise:** `RBAC_COMPLETE` (write this exact string in your final message when — and only when — all phase gates pass)

---

## Objective

Fully implement the hardened RBAC plan: three-tier roles (Super Admin / Lead / Member), permission engine, JIT login, admin API, frontend gating, and hardening. **One phase per session iteration** unless you have capacity to finish a whole phase in one run.

Replace today's "any workspace MEMBER can mutate anything" model with API-enforced permissions and UI affordance hiding on a **shared dashboard** for all roles.

---

## How to use this file

1. Start Claude Code in the repo root.
2. Run: `/goal @.claude/goals/implement-rbac.md` (or paste this file as the session task).
3. Read the **Current phase** section below; implement only that phase.
4. Run that phase's **Gate** commands; fix failures before advancing.
5. Commit: `feat(rbac): <phase> - <short summary>`
6. Update **Progress tracker** in this file (check boxes, set current phase).
7. If the phase gate passes, advance to the next phase and continue (or end session — a stop hook can re-feed this file).
8. When Phase E gate passes, write `RBAC_COMPLETE` in your summary and set **Status:** DONE below.

**Kill switch:** `touch .claude/goals/STOP` — do not advance phases if this file exists.

---

## Progress tracker

Update this section as you work:

| Phase | Status | Commit hash | Gate |
|-------|--------|-------------|------|
| A — Schema & foundation | ✅ done | 924a6da | ✅ all pass |
| B — Permission engine | ✅ done | (pending commit) | ✅ tsc all pass |
| C — Auth & admin API | ⬜ pending | | |
| D — Frontend | ⬜ pending | | |
| E — Hardening | ⬜ pending | | |

**Current phase:** C

---

## Product requirements (do not drift)

| Tier | Implementation | Behavior |
|------|----------------|----------|
| Super Admin (~3) | `User.role = SUPER_ADMIN`, seeded via `SUPER_ADMIN_EMAILS` | Company-wide bypass; manage leads; excluded from assignee rosters (inherits current ADMIN behavior) |
| Team Admin / Lead | `ProjectMember.role = LEAD` per project | Edit assignments, planned hours, capacity, sprint/epic structure **for their project only**; Team Work view on My Work |
| Member (default) | `User.role = MEMBER` + `ProjectMember.role = MEMBER` | JIT login for `@geti.education`; shared default password then forced change; **read-all** on Flow/sprint/epics; **write only on assigned tasks** (workflow: move, done, blocked); cannot delete tasks, edit hours, or assign others |

**Shared UI** — no separate admin app. Super Admin gets `/settings/admin` only.

---

## Architecture (validated — implement as written)

### Role mapping

- **Do NOT** use `GlobalRole.ADMIN` for team leads.
- Super Admin = elevated global role, excluded from rosters via `{ role: { not: 'SUPER_ADMIN' } }`.
- Lead = `ProjectRole.LEAD` on a normal member account.

### Permission resolution order (implement once in `permissions.ts`)

```
1. SUPER_ADMIN → allow (full bypass)
2. else require WorkspaceMember → else 403
3. ProjectRole.LEAD on target project → allow lead-scoped actions
4. ProjectMember + assigned to task → allow workflow-only actions
5. else → deny (read still allowed for view actions)
```

### Owner-confirm defaults (implement these unless blocked — do NOT stop for human input)

| ID | Question | Default to implement |
|----|----------|---------------------|
| OQ-1 | Can members log own sprint actual hours? | **Lead-only** (`sprintactual:write` for others; members get 403 on PUT/DELETE actuals) |
| OQ-2 | JIT project auto-join? | Use `DEFAULT_PROJECT_ID` if set; else no project membership (empty My Work until added) |
| OQ-3 | Can leads delete sprints/epics/import rollback? | **Yes** |
| OQ-4 | Super admins excluded from rosters? | **Yes** — flip all 9 `{ not: 'ADMIN' }` filters |
| OQ-5 | Super admin emails | Env only — never commit |

---

## Codebase corrections (the plan fixed these — trust the plan, not old assumptions)

1. **Sprint actuals routes:** `PUT/DELETE /sprints/:sprintId/actuals/:projectMemberId` — NOT `/members/:pmId/actual`. No `tasks.updateActualHours`.
2. **`assertProjectAccess` does NOT check `ProjectRole`** — you must read `ProjectMember.role` in the permission engine.
3. **Boards** use inline membership checks — replace with `assertCan` (includes DELETE column route).
4. **`env.ts`** uses `req()`/`opt()` — do not add Zod.
5. **`mustChangePassword`** goes in **controller** login/getMe response, not the service tuple.
6. **No test infra** — Phase B gate is `apps/api/scripts/rbac-smoke.sh` (create it).
7. **9 sites** with `role: { not: 'ADMIN' }` must become `rosterExclusionWhere` from `permissions.ts`.
8. **`MyWorkDto.isAdmin`** → rename to **`isLead`** (single consumer; no deprecated alias).

---

## Do NOT touch

- Cross-View Task State Sync section in `implementation-plan.md` and the `DONE_COL` block inside `moveTask` — add RBAC guard at **top** of `moveTask` only.
- `frontend-plan.md`
- Sprint Actual Hours **math/aggregation** — only add permission gates to write routes.
- Do **not** drop `GlobalRole.ADMIN` enum value (orphan it; D10).
- Do **not** change cookie/CORS config.
- Do **not** commit real emails or passwords.

---

## Global verification (run after every phase)

```bash
cd /home/mrstark/Documents/Repos/SprintFlow

pnpm exec tsc --noEmit -p apps/api
pnpm exec tsc --noEmit -p apps/web
pnpm exec tsc --noEmit -p packages/shared
pnpm exec tsc --noEmit -p packages/db
```

---

# Phase A — Schema & foundation

## Scope

- Add `SUPER_ADMIN` to `GlobalRole` in Prisma + `packages/shared/src/enums.ts`. Keep `ADMIN` enum value (orphaned).
- Add `User.mustChangePassword Boolean @default(false)`.
- Migration: add enum value (own step if needed), `UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN'`, add column.
- `packages/shared/src/types.ts`: `UserDto.mustChangePassword`; rename `MyWorkDto.isAdmin` → `isLead`; add `projectMemberships` type for auth/me.
- `apps/api/src/lib/env.ts` + `.env.example`: `ALLOWED_EMAIL_DOMAINS`, `DEFAULT_MEMBER_PASSWORD`, `SUPER_ADMIN_EMAILS`, `SEED_SUPER_ADMIN_PASSWORD`, `DEFAULT_WORKSPACE_SLUG?`, `DEFAULT_PROJECT_ID?`
- `packages/db/src/seed.ts`: upsert `SUPER_ADMIN_EMAILS` as `SUPER_ADMIN` + `WorkspaceMember(OWNER)`; reuse weak-password guard; dev `admin@sprintflow.local` → `SUPER_ADMIN`; gate demo users behind non-production.

## Key files

```
packages/db/prisma/schema.prisma
packages/db/prisma/migrations/<new>/
packages/shared/src/enums.ts
packages/shared/src/types.ts
apps/api/src/lib/env.ts
.env.example
packages/db/src/seed.ts
```

## Gate

- [ ] `pnpm db:migrate` (or equivalent) applies cleanly
- [ ] Global verification (tsc) passes all 4 packages
- [ ] `SUPER_ADMIN` exists in DB enum; existing ADMIN rows migrated

**On pass:** mark Phase A done in Progress tracker; set Current phase → B; commit.

---

# Phase B — Permission engine

## Scope

Create `apps/api/src/lib/permissions.ts`:

- Export: `TaskAction`, `ProjectAction`, `getActorContext`, `can`, `assertCan`
- Helpers: `isSuperAdmin`, `getProjectMembership`, `isLeadOnProject`, `isAssignedToTask`
- Export: `rosterExclusionWhere = { role: { not: 'SUPER_ADMIN' } }`

Wire `assertCan` into:

| File | What |
|------|------|
| `tasks.service.ts` | create, update (field-split), move, delete, assignments, comments |
| `sprints.routes.ts` | sprint CRUD + actuals PUT/DELETE |
| `projects.routes.ts` | project CRUD, member patch, epics — **real LEAD checks** |
| `import.service.ts` | upload, commit, rollback |
| `boards.routes.ts` | add/delete/reorder columns — replace inline checks |
| `users.routes.ts` | invite → `requireSuperAdmin` |

**Field-split** in `updateTask`: workflow keys `{ done, blocked, blockedReason, deferred, deferredReason, columnId, position }` → `task:workflow`; all other keys → `task:edit_meta`.

**Flip all 9** `{ not: 'ADMIN' }` → `rosterExclusionWhere` (grep to find any missed).

**Middleware:** `requireSuperAdmin` in `auth.ts`; replace `requireGlobalRole('ADMIN')`.

Create `apps/api/scripts/rbac-smoke.sh` — login as super/lead/member, assert status codes from checklist below.

## Gate (rbac-smoke.sh + manual if needed)

- [ ] Member `DELETE /tasks/:id` (assigned) → 403
- [ ] Member `PUT /tasks/:id/assignments/:pmId` → 403
- [ ] Member `PATCH /tasks/:id/move` assigned → 200; unassigned → 403
- [ ] Member `PATCH /tasks/:id` workflow-only → 200; meta key → 403
- [ ] Member `PUT /sprints/:id/actuals/:pmId` → 403
- [ ] Member `POST /boards/:id/columns` → 403; Lead → 200
- [ ] Lead assignment hours on own project → 200; other project → 403
- [ ] Super admin NOT in project member roster / my-work allMembersWork
- [ ] Lead `GET /admin/users` → 403 (admin routes may not exist yet — skip until Phase C, then re-run full script)

**On pass:** mark Phase B done; set Current phase → C; commit (paste smoke output in commit body).

---

# Phase C — Auth & admin API

## Scope

**Auth (`auth.service.ts`):**

- JIT provision per provisioning diagram in plan (domain allowlist, default password, derive name, workspace join D11, optional project D12)
- Super admin barred from `DEFAULT_MEMBER_PASSWORD`
- JIT user created `ACTIVE` + `mustChangePassword: true`

**Auth controller:**

- Login response: `{ accessToken, user, mustChangePassword? }`
- `getMe`: add `projectMemberships`
- `changePassword`: clear `mustChangePassword`

**New module** `apps/api/src/modules/admin/` mounted at `/api/v1/admin`, all `requireSuperAdmin`:

| Method | Path |
|--------|------|
| GET | `/admin/users` |
| PATCH | `/admin/users/:userId/lead` — body `{ projectId, role: 'LEAD' \| 'MEMBER' }` |
| PATCH | `/admin/users/:userId/status` |
| POST | `/admin/users/:userId/reset-password` |

**Audit:** add `ActivityAction` values `USER_ROLE_CHANGED`, `USER_DEACTIVATED`, `PASSWORD_RESET`, `USER_PROVISIONED`; write on admin actions.

Register admin routes in `apps/api/src/app.ts`.

## Gate

- [ ] Unknown `@geti.education` + default password → user created, `mustChangePassword: true`, login 200
- [ ] Wrong domain → 401
- [ ] Super admin + default password → 401
- [ ] `changePassword` clears flag
- [ ] `/auth/me` returns `projectMemberships`
- [ ] Promote-to-lead writes `ProjectMember(LEAD)` + audit row
- [ ] Re-run `rbac-smoke.sh` fully green

**On pass:** mark Phase C done; set Current phase → D; commit.

---

# Phase D — Frontend

## Scope

**Auth gate:**

- `lib/api/auth.ts` — `LoginResponse` + getMe types
- `store/auth.store.ts` — `mustChangePassword`, `projectMemberships`
- `app/(app)/layout.tsx` — redirect to `/settings/password` when flag set
- **New** `app/(app)/settings/password/page.tsx` — blocking change-password form
- `hooks/useRequireAuth.ts` — respect gate

**New** `hooks/usePermissions.ts`:

```ts
{ isSuperAdmin, isLead(projectId), can(action, projectId?, isAssigned?) }
```

**Gate UI (hide only — API enforces):**

| File | Gated |
|------|-------|
| `board/TaskDetailDrawer.tsx` | delete, meta, assignment hours |
| `board/Board.tsx` | drag only when assigned/lead/super |
| `scrum/SprintBoardView.tsx` | hour edits, sprint actuals, non-assigned done |
| `scrum/ScrumTaskDrawer.tsx` | same |
| `scrum/InlineAddTask.tsx` | create (lead+) |
| `app/(app)/my-work/page.tsx` | `isLead` not `isAdmin` |
| `layout/Sidebar.tsx` | Admin Settings (super only); hide Import for members |
| import route + `onboarding/page.tsx` | lead/super only |

**New** `app/(app)/settings/admin/page.tsx` + `lib/api/admin.ts`

**API consumer:** my-work uses `isLead` from API response

## Merge hotspots (add guards at function top — don't rewrite done-logic blocks)

- `Board.tsx`, `SprintBoardView.tsx`, `TaskDetailDrawer.tsx`, `moveTask` in tasks.service.ts

## Gate

- [ ] Member UI: no delete, no hour inputs, no import nav, drag only assigned cards
- [ ] Lead UI: team work view, hour edits, import visible
- [ ] Super admin: `/settings/admin` works (promote/demote/deactivate/reset)
- [ ] `/settings/password` blocks app until changed
- [ ] Global tsc passes

**On pass:** mark Phase D done; set Current phase → E; commit.

---

# Phase E — Hardening

## Scope

- Wire `ActivityLog` for admin actions + JIT provision (if not fully done in C)
- Login rate limit: `express-rate-limit` ~10/min/IP on `POST /auth/login`
- README auth/roles section

## Gate

- [ ] Admin actions + JIT in activity log
- [ ] Rate limit returns 429 when exceeded
- [ ] README updated
- [ ] Full `rbac-smoke.sh` green
- [ ] Global tsc passes

**On pass:** mark Phase E done; set **Status:** DONE; write `RBAC_COMPLETE`.

---

## Exit conditions

| Condition | Action |
|-----------|--------|
| All phases A–E gates pass | Set Status DONE; output `RBAC_COMPLETE`; optionally rename this file to `implement-rbac.done.md` |
| Same gate item fails **twice** after fix attempts | STOP; document failure in Progress tracker; do not advance phase |
| `.claude/goals/STOP` exists | STOP immediately; do not commit partial broken state |
| Hit ambiguous requirement contradicting plan | Implement plan default from OQ table; note in commit message |

---

## Reference files (read before implementing)

```
implementation-plan.md                    # full RBAC section (~line 384)
rbac-plan-handoff.md                      # original requirements context
packages/db/prisma/schema.prisma
apps/api/src/lib/rbac.ts
apps/api/src/middleware/auth.ts
apps/api/src/modules/auth/auth.service.ts
apps/api/src/modules/auth/auth.controller.ts
apps/api/src/modules/tasks/tasks.service.ts
apps/api/src/modules/tasks/tasks.routes.ts
apps/api/src/modules/projects/projects.routes.ts
apps/api/src/modules/sprints/sprints.routes.ts
apps/api/src/modules/import/import.service.ts
apps/api/src/modules/boards/boards.routes.ts
apps/api/src/modules/users/users.routes.ts
packages/shared/src/enums.ts
packages/shared/src/types.ts
apps/web/src/app/(app)/my-work/page.tsx
packages/db/src/seed.ts
PROGRESS.md                               # Phase 11, 12 context
```

---

## Constraints (non-negotiable)

- API MUST enforce permissions even when UI hides controls.
- Match existing code style; minimal diff outside RBAC.
- Never commit secrets.
- Do not drop `GlobalRole.ADMIN` enum value.
- Super Admin excluded from assignee lists (Phase 12 behavior preserved, filter updated to SUPER_ADMIN).

---

*Goal file for Claude Code autonomous implementation. Source plan hardened 2026-06-13.*
