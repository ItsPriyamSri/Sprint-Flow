import { prisma } from './prisma';
import { ForbiddenError, UnauthorizedError } from './errors';

// ─── Action types ─────────────────────────────────────────────────────────────

export type TaskAction =
  | 'task:create'        // lead+
  | 'task:edit_meta'     // lead+ (title, priority, sprint, epic, etc.)
  | 'task:workflow'      // assigned member+ (done, blocked, deferred, column, position)
  | 'task:delete'        // lead+
  | 'task:assign'        // lead+ (manage assignments, set hours)
  | 'task:comment_add'   // any workspace member
  | 'task:comment_delete'; // author or lead+ or ws ADMIN/OWNER

export type ProjectAction =
  | 'project:create'       // super admin
  | 'project:update'       // lead on project
  | 'project:member_patch' // lead on project
  | 'sprint:create'        // lead on project
  | 'sprint:update'        // lead on project
  | 'sprint:delete'        // lead on project
  | 'sprint:actuals_write' // lead on project (OQ-1)
  | 'epic:create'          // lead on project
  | 'epic:update'          // lead on project
  | 'epic:delete'          // lead on project
  | 'import:write'         // lead on project
  | 'board:column_write';  // lead on project

// Roster query filter — excludes Super Admin from assignee lists
export const rosterExclusionWhere = { user: { role: { not: 'SUPER_ADMIN' as const } } };

// ─── Actor context ────────────────────────────────────────────────────────────

interface ActorContext {
  userId: string;
  role: string; // GlobalRole value
  workspaceId: string;
}

export async function getActorContext(userId: string, workspaceId: string): Promise<ActorContext> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw new UnauthorizedError('User not found');
  return { userId, role: user.role, workspaceId };
}

export function isSuperAdmin(ctx: ActorContext): boolean {
  return ctx.role === 'SUPER_ADMIN';
}

export async function getProjectMembership(userId: string, projectId: string) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true, role: true },
  });
}

export async function isLeadOnProject(userId: string, projectId: string): Promise<boolean> {
  const pm = await getProjectMembership(userId, projectId);
  return pm?.role === 'LEAD';
}

export async function isAssignedToTask(userId: string, taskId: string): Promise<boolean> {
  const count = await prisma.taskAssignment.count({
    where: {
      taskId,
      projectMember: { userId },
    },
  });
  return count > 0;
}

// ─── Core permission check ────────────────────────────────────────────────────

interface PermissionCtx {
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
}

/**
 * Returns true if the actor can perform the action given the context.
 * Resolution order (from implementation plan):
 *   1. SUPER_ADMIN → allow
 *   2. else require WorkspaceMember → else deny
 *   3. ProjectRole.LEAD on target project → allow lead-scoped actions
 *   4. ProjectMember + assigned to task → allow workflow-only
 *   5. else → deny
 */
export async function can(
  actorId: string,
  action: TaskAction | ProjectAction,
  ctx: PermissionCtx,
): Promise<boolean> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (!actor) return false;

  // Step 1: Super admin bypass
  if (actor.role === 'SUPER_ADMIN') return true;

  // Step 2: Workspace membership gate
  const wsMembership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: actorId, workspaceId: ctx.workspaceId } },
    select: { role: true },
  });
  if (!wsMembership) return false;

  // Actions always denied for non-super-admin in global scope
  if (action === 'project:create') return false;

  // Workspace OWNER/ADMIN can perform any action within their workspace
  const isWsOwnerOrAdmin = wsMembership.role === 'OWNER' || wsMembership.role === 'ADMIN';
  if (isWsOwnerOrAdmin) return true;

  // Step 3: Check project-level LEAD role
  const projectId = ctx.projectId;
  const isLead = projectId ? await isLeadOnProject(actorId, projectId) : false;

  // Lead-scoped actions (project operations, meta edits, assignments, sprint/epic/import/board)
  const leadActions: Array<TaskAction | ProjectAction> = [
    'task:create', 'task:edit_meta', 'task:workflow', 'task:delete', 'task:assign',
    'project:update', 'project:member_patch',
    'sprint:create', 'sprint:update', 'sprint:delete', 'sprint:actuals_write',
    'epic:create', 'epic:update', 'epic:delete',
    'import:write', 'board:column_write',
  ];
  if (leadActions.includes(action) && isLead) return true;

  // Any workspace member can add comments
  if (action === 'task:comment_add') return true;

  // Comment delete: author check happens in the service (context-dependent)
  // Return true here; the service does the author/ownership check
  if (action === 'task:comment_delete') {
    const isWsAdmin = wsMembership.role === 'ADMIN' || wsMembership.role === 'OWNER';
    return isWsAdmin;
  }

  // Step 4: Workflow actions for assigned members
  if (action === 'task:workflow' && ctx.taskId) {
    return isAssignedToTask(actorId, ctx.taskId);
  }

  // Step 5: Deny
  return false;
}

/**
 * Throws ForbiddenError if the actor cannot perform the action.
 */
export async function assertCan(
  actorId: string,
  action: TaskAction | ProjectAction,
  ctx: PermissionCtx,
): Promise<void> {
  const allowed = await can(actorId, action, ctx);
  if (!allowed) {
    throw new ForbiddenError(`Action '${action}' not permitted`);
  }
}

/**
 * Throws ForbiddenError unless actor is a Super Admin.
 */
export async function assertSuperAdmin(actorId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } });
  if (user?.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Requires Super Admin');
  }
}
