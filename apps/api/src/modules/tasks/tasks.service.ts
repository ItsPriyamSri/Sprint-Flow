import { Prisma } from '@sprintflow/db';
import { prisma } from '../../lib/prisma';
import { assertWorkspaceMember } from '../../lib/rbac';
import { NotFoundError, ForbiddenError } from '../../lib/errors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CreateTaskInput {
  workspaceId: string;
  boardId: string;
  columnId: string;
  projectId?: string;
  title: string;
  description?: string;
  notes?: string;
  priority?: 'P0' | 'P1' | 'P2';
  sprintId?: string;
  epicId?: string;
  externalId?: string;
  done?: boolean;
  blocked?: boolean;
  blockedReason?: string;
  deferred?: boolean;
  deferredReason?: string;
}

interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  notes?: string | null;
  priority?: 'P0' | 'P1' | 'P2' | null;
  sprintId?: string | null;
  epicId?: string | null;
  columnId?: string;
  externalId?: string | null;
  done?: boolean;
  blocked?: boolean;
  blockedReason?: string | null;
  deferred?: boolean;
  deferredReason?: string | null;
  projectId?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function assertTaskAccess(
  taskId: string,
  workspaceId: string,
  userId: string,
  minRole: 'VIEWER' | 'MEMBER' = 'VIEWER',
) {
  await assertWorkspaceMember(userId, workspaceId, minRole);
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new NotFoundError('Task');
  if (task.workspaceId !== workspaceId) throw new ForbiddenError('Task not in this workspace');
  return task;
}

async function getLastPosition(columnId: string): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { columnId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1000;
}

function pickDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const f of fields) {
    if (before[f] !== after[f]) {
      b[f] = before[f];
      a[f] = after[f];
    }
  }
  return { before: b, after: a };
}

const AUDIT_FIELDS = [
  'title', 'priority', 'columnId', 'sprintId', 'epicId',
  'notes', 'description', 'externalId', 'done', 'deferred',
  'blocked', 'blockedReason',
];

// ─── Task select shape ────────────────────────────────────────────────────────

const TASK_INCLUDE = {
  sprint:  { select: { id: true, name: true } },
  epic:    { select: { id: true, name: true, color: true } },
  column:  { select: { id: true, name: true, key: true } },
  assignments: {
    include: {
      projectMember: {
        select: { id: true, hoursPerDay: true, user: { select: { id: true, name: true } } },
      },
    },
  },
  comments: {
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' } as const,
  },
} as const;

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createTask(actorId: string, input: CreateTaskInput) {
  await assertWorkspaceMember(actorId, input.workspaceId, 'MEMBER');
  const position = await getLastPosition(input.columnId);

  const task = await prisma.task.create({
    data: {
      workspaceId: input.workspaceId,
      boardId: input.boardId,
      columnId: input.columnId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      notes: input.notes,
      priority: input.priority,
      sprintId: input.sprintId,
      epicId: input.epicId,
      externalId: input.externalId,
      done: input.done ?? false,
      blocked: input.blocked ?? false,
      blockedReason: input.blockedReason,
      deferred: input.deferred ?? false,
      deferredReason: input.deferredReason,
      position,
    },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId,
      action: 'TASK_CREATED',
      entityType: 'task',
      entityId: task.id,
      diff: { after: { title: task.title, columnId: task.columnId } } as Prisma.InputJsonValue,
    },
  });

  return task;
}

export async function getTask(taskId: string, workspaceId: string, userId: string) {
  await assertWorkspaceMember(userId, workspaceId, 'VIEWER');
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: TASK_INCLUDE,
  });

  if (!task) throw new NotFoundError('Task');
  if (task.workspaceId !== workspaceId) throw new ForbiddenError('Task not in this workspace');

  return task;
}

export async function updateTask(
  taskId: string,
  workspaceId: string,
  actorId: string,
  input: UpdateTaskInput,
) {
  const old = await assertTaskAccess(taskId, workspaceId, actorId, 'MEMBER');

  const DONE_COL = /^(done|completed|finished)$/i;

  // When done is toggled true and the caller isn't already specifying a column,
  // automatically move the task into the board's Done column.
  let autoColumnId: string | undefined;
  let autoPosition: number | undefined;
  if (input.done === true && !old.done && old.boardId && input.columnId === undefined) {
    const cols = await prisma.boardColumn.findMany({
      where: { boardId: old.boardId },
      select: { id: true, name: true },
    });
    const doneCol = cols.find(c => DONE_COL.test(c.name.trim()));
    if (doneCol && old.columnId !== doneCol.id) {
      autoColumnId = doneCol.id;
      autoPosition = await getLastPosition(doneCol.id);
    }
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined      && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.notes !== undefined       && { notes: input.notes }),
      ...(input.priority !== undefined    && { priority: input.priority }),
      ...(input.sprintId !== undefined    && { sprintId: input.sprintId }),
      ...(input.epicId !== undefined      && { epicId: input.epicId }),
      ...(input.columnId !== undefined    && { columnId: input.columnId }),
      ...(input.externalId !== undefined  && { externalId: input.externalId }),
      ...(input.done !== undefined        && { done: input.done }),
      ...(input.blocked !== undefined     && { blocked: input.blocked }),
      ...(input.blockedReason !== undefined && { blockedReason: input.blockedReason }),
      ...(input.deferred !== undefined    && { deferred: input.deferred }),
      ...(input.deferredReason !== undefined && { deferredReason: input.deferredReason }),
      ...(input.projectId !== undefined   && { projectId: input.projectId }),
      ...(autoColumnId !== undefined      && { columnId: autoColumnId, position: autoPosition }),
    },
  });

  const diff = pickDiff(
    old as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    AUDIT_FIELDS,
  );

  if (Object.keys(diff.before).length > 0) {
    const action = input.done !== undefined
      ? (input.done ? 'TASK_DONE' : 'TASK_UPDATED')
      : input.deferred !== undefined
        ? 'TASK_DEFERRED'
        : input.blocked !== undefined
          ? (input.blocked ? 'TASK_BLOCKED' : 'TASK_UNBLOCKED')
          : 'TASK_UPDATED';

    await prisma.activityLog.create({
      data: {
        workspaceId,
        actorId,
        action,
        entityType: 'task',
        entityId: taskId,
        diff: diff as Prisma.InputJsonValue,
      },
    });
  }

  return updated;
}

export async function moveTask(
  taskId: string,
  workspaceId: string,
  actorId: string,
  move: { columnId: string; position: number },
) {
  const old = await assertTaskAccess(taskId, workspaceId, actorId, 'MEMBER');

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { columnId: move.columnId, position: move.position },
    include: { column: { select: { name: true } } },
  });

  const DONE_COL = /^(done|completed|finished)$/i;

  if (old.columnId !== move.columnId) {
    const oldCol = await prisma.boardColumn.findUnique({
      where: { id: old.columnId },
      select: { name: true },
    });

    const destIsDone = DONE_COL.test(updated.column.name.trim());
    const srcIsDone  = oldCol ? DONE_COL.test(oldCol.name.trim()) : false;

    let doneAction: 'TASK_MOVED' | 'TASK_DONE' | 'TASK_UPDATED' = 'TASK_MOVED';
    if (destIsDone && !old.done) {
      await prisma.task.update({ where: { id: taskId }, data: { done: true } });
      doneAction = 'TASK_DONE';
    } else if (srcIsDone && !destIsDone && old.done) {
      await prisma.task.update({ where: { id: taskId }, data: { done: false } });
      doneAction = 'TASK_UPDATED';
    }

    await prisma.activityLog.create({
      data: {
        workspaceId,
        actorId,
        action: doneAction,
        entityType: 'task',
        entityId: taskId,
        diff: {
          before: { columnId: old.columnId, columnName: oldCol?.name },
          after:  { columnId: move.columnId, columnName: updated.column.name },
        } as Prisma.InputJsonValue,
      },
    });
  }

  return updated;
}

export async function deleteTask(taskId: string, workspaceId: string, actorId: string) {
  const task = await assertTaskAccess(taskId, workspaceId, actorId, 'MEMBER');
  await prisma.task.delete({ where: { id: taskId } });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      actorId,
      action: 'TASK_DELETED',
      entityType: 'task',
      entityId: taskId,
      diff: { before: { title: task.title } } as Prisma.InputJsonValue,
    },
  });
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export async function upsertAssignment(
  taskId: string,
  workspaceId: string,
  actorId: string,
  projectMemberId: string,
  hours: number,
) {
  const task = await assertTaskAccess(taskId, workspaceId, actorId, 'MEMBER');

  const member = await prisma.projectMember.findUnique({ where: { id: projectMemberId } });
  if (!member) throw new NotFoundError('Project member');
  if (task.projectId && member.projectId !== task.projectId) {
    throw new ForbiddenError('Member does not belong to this task\'s project');
  }

  return prisma.taskAssignment.upsert({
    where: { taskId_projectMemberId: { taskId, projectMemberId } },
    update: { hours: new Prisma.Decimal(hours) },
    create: { taskId, projectMemberId, hours: new Prisma.Decimal(hours) },
  });
}

export async function removeAssignment(
  taskId: string,
  workspaceId: string,
  actorId: string,
  projectMemberId: string,
) {
  await assertTaskAccess(taskId, workspaceId, actorId, 'MEMBER');

  await prisma.taskAssignment.deleteMany({
    where: { taskId, projectMemberId },
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function createComment(
  taskId: string,
  workspaceId: string,
  authorId: string,
  body: string,
) {
  await assertTaskAccess(taskId, workspaceId, authorId, 'MEMBER');

  const comment = await prisma.comment.create({
    data: { taskId, authorId, body },
    include: { author: { select: { id: true, name: true } } },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      actorId: authorId,
      action: 'TASK_COMMENTED',
      entityType: 'task',
      entityId: taskId,
    },
  });

  return comment;
}

export async function updateComment(
  taskId: string,
  commentId: string,
  workspaceId: string,
  actorId: string,
  body: string,
) {
  await assertWorkspaceMember(actorId, workspaceId, 'MEMBER');
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError('Comment');
  if (comment.taskId !== taskId) throw new ForbiddenError('Comment does not belong to this task');
  if (comment.authorId !== actorId) throw new ForbiddenError('Only the author can edit this comment');

  return prisma.comment.update({
    where: { id: commentId },
    data: { body },
    include: { author: { select: { id: true, name: true } } },
  });
}

export async function deleteComment(
  taskId: string,
  commentId: string,
  workspaceId: string,
  actorId: string,
) {
  await assertWorkspaceMember(actorId, workspaceId, 'MEMBER');
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError('Comment');
  if (comment.taskId !== taskId) throw new ForbiddenError('Comment does not belong to this task');

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: actorId, workspaceId } },
  });
  const isAdminOrOwner = membership && (membership.role === 'ADMIN' || membership.role === 'OWNER');

  if (comment.authorId !== actorId && !isAdminOrOwner) {
    throw new ForbiddenError('You do not have permission to delete this comment');
  }

  await prisma.comment.delete({ where: { id: commentId } });
}

// ─── Helpers for serialization ────────────────────────────────────────────────

export function serializeAssignments(
  assignments: Array<{
    id: string;
    projectMemberId: string;
    hours: Prisma.Decimal;
    projectMember: { id: string; user: { id: string; name: string } };
  }>,
) {
  return assignments.map((a) => ({
    id: a.id,
    projectMemberId: a.projectMemberId,
    memberName: a.projectMember.user.name,
    hours: Number(a.hours),
  }));
}
