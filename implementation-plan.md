# Team-Based Access Control — Implementation Plan

> **Confirmed decisions (locked):** D1 Team = reuse `Workspace`. D2 Rename "Workspace" → "Team" in
> the UI (DB model keeps the name `Workspace`). D3 **Only the super admin creates teams & assigns
> leads**; team leads manage members within their own team. D4 Name→email = **re-point on link**
> (move `ProjectMember`/assignments onto the real account; handle the merge case). Plus: **purge all
> dummy accounts** (Iris/Nate) — only real `@geti.education` accounts may exist.

## 1. The core decision: **a Team _is_ a Workspace**

The schema was designed for this from day one. From `PROGRESS.md`:

> **Tenancy** — Schema fully multi-workspace, MVP shows one workspace — *"Zero-migration multi-team later."*

We do **not** introduce a new `Team` model. Instead we activate the existing multi-workspace
capability and rename it "Team" in the UI. This means:

- **Team** = `Workspace` (DB model unchanged; UI label becomes "Team")
- **Team Lead** = `WorkspaceMember` with role `OWNER` (co-leads can use `ADMIN`)
- **Team Member** = `WorkspaceMember` with role `MEMBER` (or `VIEWER` for read-only)
- **Super Admin** = `User.role = SUPER_ADMIN` (global; sees & manages all teams)
- **A team's projects** = `Project.workspaceId` → team isolation is automatic
- **Per-task interaction** = `TaskAssignment → ProjectMember → User` (unchanged rule)

Why reuse Workspace instead of a new nested model:
- Everything (Project, Sprint, Epic, Task, Board, Label, ActivityLog, Notification) is
  **already `workspaceId`-scoped**. A new Team layer would duplicate this and force a large migration.
- The permission engine (`apps/api/src/lib/permissions.ts`) already grants a workspace
  `OWNER`/`ADMIN` full authority over everything in the workspace — exactly the "team lead can
  interact with everything in their team's projects" rule.

## 2. Role & authority mapping

| Concept (your words)                         | Implemented as                                  | Already enforced? |
|----------------------------------------------|-------------------------------------------------|-------------------|
| Super admin — full authority over everything | `GlobalRole.SUPER_ADMIN`                         | ✅ bypasses all checks (`permissions.ts:98`) |
| Team lead — full authority in their team     | `WorkspaceMember.role = OWNER`/`ADMIN`           | ✅ `isWsOwnerOrAdmin → return true` (`permissions.ts:110-112`) |
| Team member — interacts with assigned tasks  | `WorkspaceMember.role = MEMBER` + `TaskAssignment` | ✅ `task:workflow` gated by `isAssignedToTask` (`permissions.ts:139-141`) |
| Team sees only its own projects              | `Project.workspaceId == team`                    | ⚠️ backend query is workspace-scoped, but frontend only ever loads ONE workspace |
| Name (Excel owner) → email mapping           | `User.linkedToId` (UNCLAIMED stub → real user)   | ⚠️ link exists but does NOT yet grant task interaction |

## 3. What already works (do not rebuild)

- Workspace membership gate + role hierarchy (`OWNER>ADMIN>MEMBER>VIEWER`) in `lib/rbac.ts` / `lib/permissions.ts`.
- Team-lead-grade authority: a workspace `OWNER`/`ADMIN` can do any action in that workspace.
- "Only the assigned person can move/complete/block a task": `task:workflow` → `isAssignedToTask`.
- Super admin bypass across all workspaces.
- Forced password change on first login (`User.mustChangePassword`, redirect in `app/(app)/layout.tsx`).
- Admin dashboard UI shell with user management, name-linking, lead assignment, reset password, deactivate.
- `@geti.education` domain enforcement on new user creation.

## 4. The gaps to close

1. **Single-workspace assumption in the frontend.** `GET /workspaces/mine` uses `findFirst` and
   returns the user's *first* workspace only; the UI has a project switcher but **no team switcher**.
2. **JIT provisioning auto-joins everyone to the default workspace** (`auth.service.ts:jitProvision`
   + `DEFAULT_WORKSPACE_SLUG`/`DEFAULT_PROJECT_ID`). This actively breaks team isolation — every new
   `@geti.education` login lands in the same team.
3. **All admin capabilities are `SUPER_ADMIN`-only** (`adminRouter.use(requireAuth, requireSuperAdmin)`).
   Team leads have no scoped admin surface.
4. **No team-management endpoints** (create/rename team, add/remove members, assign lead).
5. **No "you're not in a team" empty state.**
6. **Name→email link doesn't grant interaction.** `isAssignedToTask` matches `ProjectMember.userId`
   directly; a real user linked to a name-stub won't pass.
7. **Existing data lives in one workspace** ("CARR Workspace") and must be split into real teams.

---

## 5. Phased plan

### Phase 1 — Data model, dummy-account purge & migration (small)

- Keep `Workspace`/`WorkspaceMember`/`ProjectMember` models **as-is**. No schema migration strictly
  required for core functionality.
- Optional niceties (one migration): `Workspace.description String?`, `Workspace.archivedAt DateTime?`.
- **Purge dummy accounts (Iris/Nate) — real `@geti.education` accounts only:**
  - Rewrite `packages/db/src/seed.ts`: delete the entire `!isProduction` demo block (Iris/Nate users,
    `pm-iris`/`pm-nate` project members, and all demo tasks/assignments that reference them). Seed
    should create only the workspace + env-configured super admin(s). Real members arrive via
    lead-driven invites. Keep the `CARR Workspace`/`CARR Release` names (those are real projects, not people).
  - Add a one-off cleanup script `packages/db/src/scripts/remove-dummy-users.ts` (mirror the existing
    `remove-admin-memberships.ts`) that deletes `iris@*` / `nate@*` users and any `ProjectMember`,
    `TaskAssignment`, `Comment`, `ActivityLog` rows referencing them from the live dev DB.
  - Grep the whole repo for `iris`/`nate`/`sprintflow.local` and remove leftover references
    (tests, fixtures, demo scripts, `PROGRESS.md` demo script).
- **Data backfill script** (`packages/db/src/scripts/`):
  - Treat the existing "CARR Workspace" as the **R&D team** (it holds CARR + Gamified App).
  - Create the **IT team** as a new `Workspace`; create/move its projects (`Project.workspaceId`).
  - Set the R&D and IT team leads as `WorkspaceMember(OWNER)` (real `@geti.education` accounts).
  - `SUPER_ADMIN` need NOT be a member of every team (permission engine already bypasses).
- **Retire the auto-join env defaults** for production: stop relying on `DEFAULT_WORKSPACE_SLUG` /
  `DEFAULT_PROJECT_ID` to funnel everyone into one team.

### Phase 2 — Backend: multi-team surfacing & isolation

- **List my teams:** new `GET /workspaces` → all workspaces the caller is a `WorkspaceMember` of
  (super admin → all workspaces). Returns `{ id, name, slug, role }[]`.
- **Hydrate a selected team:** parameterize the existing `mine` payload. Either
  `GET /workspaces/:id/hydrate` or `GET /workspaces/mine?workspaceId=` — returns the projects/
  sprints/epics/boards bundle (currently in `/workspaces/mine`) **for the chosen team**, after an
  `assertWorkspaceMember` check.
- **Fix JIT provisioning** (`auth.service.ts`): a brand-new allowed-domain user is still created so
  they can authenticate, **but is NOT auto-added to any workspace/project**. They land on the
  "not in a team" state until a lead/admin adds them. (Recommended: prefer lead-driven invite over JIT.)
- **Empty-team response:** `GET /workspaces` returning `[]` is the signal the frontend uses to show
  the empty state (no more `404 NotFound` from `mine`).

### Phase 3 — Backend: team management (team-scoped admin)

- **New authorization helper `requireTeamAdmin`:** allow if `SUPER_ADMIN`, OR
  `WorkspaceMember(OWNER|ADMIN)` for the **target** `workspaceId`. Every team-scoped write must
  verify the target user/project/member belongs to that workspace (prevent cross-team escalation).
- **Team CRUD:**
  - `POST /teams` — create a team + assign its lead. **Super admin only** (D3). The named lead is
    added as `WorkspaceMember(OWNER)`.
  - `PATCH /teams/:id` — rename / edit (team lead of that team, or super admin).
  - `GET /teams/:id/members` — list members (team-scoped).
  - `POST /teams/:id/members` — add member **by email** (creates the user if absent, `MEMBER`,
    `mustChangePassword=true`); scoped to the lead's own team.
  - `DELETE /teams/:id/members/:userId` — remove member.
  - `PATCH /teams/:id/members/:userId/role` — set `OWNER`/`ADMIN`/`MEMBER`/`VIEWER`
    (super admin sets leads; a lead can manage members below them).
- **Generalize existing admin endpoints** so they accept a `workspaceId` and run through
  `requireTeamAdmin` instead of `requireSuperAdmin`, scoped to that team: add-email-user,
  reset-password, deactivate, name-link/unlink, set-project-lead. (Super admin keeps the global view.)

### Phase 4 — Frontend: team switcher, active-team state & isolation

- **Active-team state:** add `activeWorkspaceId` to the store (persisted). On login:
  - call `GET /workspaces`; if empty → route to the **"not in a team"** screen;
  - else pick the persisted/first team, call the hydrate endpoint for it.
- **Team switcher** in the sidebar (above the project switcher). Visible when the user belongs to
  >1 team; **always visible for super admin** (who can jump between all teams). Switching re-hydrates
  projects/sprints/epics for that team and resets `activeProject`.
- **Projects are naturally isolated:** the hydrate payload only contains the active team's projects,
  so the existing project switcher automatically shows only that team's scrums.
- **Extend `usePermissions`:** add `isTeamLead(workspaceId?)` = active membership role in
  `{OWNER, ADMIN}` (data already present in `authStore.memberships` and the hydrate `role` field).
- **"Not in a team" empty state:** full-page message — *"You're not assigned to a team yet. Please
  contact your team lead or an administrator."* Suppress the sidebar/nav (mirror the existing
  forced-password-change gating in `app/(app)/layout.tsx`).

### Phase 5 — Frontend: Team Dashboard + Super Admin console

- **Team Dashboard** (`/settings/team` or reuse `/settings/admin` in a scoped mode): visible to
  team leads (`isTeamLead`). Scoped to the active team — manage members (add by email, remove,
  set role), rename the team, link names→emails, reset member passwords, assign per-project leads.
  This is the existing admin page with (a) team scoping and (b) team-creation/lead-assignment removed.
- **Super Admin console:** the same page in "all teams" mode — a team selector at the top, plus the
  ability to **create teams** and **assign/replace team leads** across all teams.
- **Sidebar gating updates** (`components/layout/Sidebar.tsx`):
  - Show **"Team Dashboard"** for `isTeamLead`.
  - Show **"Admin / All Teams"** for `isSuperAdmin`.
  - "Import from sheet" / "New project": keep for super admin **and** team lead of the active team.

### Phase 6 — Name→email interaction wiring (the "assign name to email" feature)

Goal: when a lead links an Excel owner-name (an `UNCLAIMED` stub, e.g. a real name from the sheet)
to a real `@geti.education` account, that person must be able to interact with tasks assigned to
that name.

- **Approach: re-point on link (D4, confirmed).** When linking stub→user, move the stub's
  `ProjectMember` rows (and thus their `TaskAssignment`s) onto the real user's account within a
  transaction, then soft-delete/retire the stub. After this, every existing query
  (`isAssignedToTask`, `/projects/:id/my-work`, assignee lists) works with **zero changes** because
  they already match `ProjectMember.userId`.
  - **Merge case:** if the real user is **already** a `ProjectMember` of that project (unique
    constraint `@@unique([projectId, userId])`), re-parent the stub's `TaskAssignment`s to the
    existing row (summing/keeping hours), delete the now-empty stub `ProjectMember`, and skip the
    move. Also de-dupe `TaskAssignment` (unique on `(taskId, projectMemberId)`).
  - Wrap in a transaction; log an `ActivityLog` entry for the merge.

### Phase 7 — Testing & rollout

- **Isolation tests:** R&D member cannot list/read IT projects, sprints, tasks (and vice versa);
  cross-team `workspaceId` in requests → 403.
- **Authority tests:** team lead can CRUD everything in their team but nothing in another;
  member can only workflow their assigned tasks; super admin can do everything everywhere.
- **First-login flows:** (a) member already added to a team → sees team projects; (b) member with a
  linked name → can interact with their tasks; (c) member in no team → sees the empty state.
- Roll out behind the data-backfill script; verify prod Railway env vars (`SUPER_ADMIN_EMAILS`,
  and retire `DEFAULT_WORKSPACE_SLUG`/`DEFAULT_PROJECT_ID` auto-join).

---

## 6. Decisions (resolved)

- **D1 — Team = Workspace (reuse).** ✅ Confirmed.
- **D2 — UI terminology.** ✅ Rename "Workspace" → "Team" in the UI; DB model stays `Workspace`.
- **D3 — Who can create teams?** ✅ **Super admin only.** Super admin creates teams and assigns each
  team's lead. Team leads manage members inside their own team but cannot create new teams.
- **D4 — Name→email wiring.** ✅ Re-point on link (move `ProjectMember`/assignments to the real
  account; handle the merge case).
- **D5 — Multiple leads per team.** `OWNER` = primary lead; `ADMIN` = optional co-lead (both get
  full team authority). Adopted.
- **Dummy accounts.** ✅ Iris/Nate and all `sprintflow.local` demo users are purged; only real
  `@geti.education` accounts exist (see Phase 1).

## 7. Risks / watch-outs

- **Cross-team leakage** is the top risk. Every team-scoped endpoint must re-verify the target
  entity's `workspaceId` against the caller's membership — never trust a `workspaceId` from the client
  without an `assertWorkspaceMember` check.
- **JIT auto-join** must be neutralized or it silently re-breaks isolation.
- **`ProjectMember` unique constraint** on `(projectId, userId)` — the name-link merge must handle it.
- **Super admin visibility:** ensure super admin can hydrate any team even without a `WorkspaceMember`
  row (permission engine bypasses, but `GET /workspaces/mine` uses membership — the new
  `GET /workspaces` must special-case super admin to list all).
- **Legacy null-project data:** some sprints/epics/tasks allow `projectId = null` (workspace-scoped).
  Confirm none are orphaned when teams are split.
