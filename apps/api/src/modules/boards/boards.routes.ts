import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError, AppError } from '../../lib/errors';
import type { Request, Response, NextFunction } from 'express';

export const boardsRouter: IRouter = Router();
boardsRouter.use(requireAuth);

// GET /boards/:boardId — columns + tasks (with filters).
boardsRouter.get('/:boardId', async (req, res, next) => {
  try {
    const { boardId } = req.params as { boardId: string };

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { workspace: { include: { members: { select: { userId: true } } } } },
    });
    if (!board) throw new NotFoundError('Board');

    const isMember = board.workspace.members.some((m) => m.userId === req.user!.id);
    if (!isMember) throw new ForbiddenError('Not a workspace member');

    const { sprint, epic, priority } = req.query as Record<string, string | undefined>;

    const columns = await prisma.boardColumn.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      include: {
        tasks: {
          where: {
            boardId,
            ...(sprint   ? { sprintId: sprint }                   : {}),
            ...(epic     ? { epicId:   epic }                     : {}),
            ...(priority ? { priority: priority as 'P0' | 'P1' | 'P2' } : {}),
          },
          orderBy: { position: 'asc' },
          include: {
            sprint:  { select: { id: true, name: true } },
            epic:    { select: { id: true, name: true, color: true } },
            assignments: {
              include: {
                projectMember: {
                  select: { id: true, user: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });

    res.json({
      id: board.id,
      name: board.name,
      workspaceId: board.workspaceId,
      columns: columns.map((col) => ({
        id: col.id,
        name: col.name,
        key: col.key,
        position: col.position,
        wipLimit: col.wipLimit,
        tasks: col.tasks.map((t) => ({
          id: t.id,
          externalId: t.externalId,
          title: t.title,
          description: t.description,
          notes: t.notes,
          priority: t.priority,
          columnId: t.columnId,
          projectId: t.projectId,
          sprintId: t.sprintId,
          sprintName: t.sprint?.name ?? null,
          epicId: t.epicId,
          epicName: t.epic?.name ?? null,
          epicColor: t.epic?.color ?? null,
          done: t.done,
          deferred: t.deferred,
          deferredReason: t.deferredReason,
          assignments: t.assignments.map((a) => ({
            id: a.id,
            projectMemberId: a.projectMemberId,
            memberName: a.projectMember.user.name,
            hours: Number(a.hours),
          })),
          position: t.position,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ── Add column ────────────────────────────────────────────────────────────────
boardsRouter.post(
  '/:boardId/columns',
  validate(z.object({ name: z.string().min(1).max(100), key: z.string().regex(/^[a-z0-9_]+$/).optional() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params as { boardId: string };
      const { name, key } = req.body as { name: string; key?: string };

      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: { workspace: { include: { members: { select: { userId: true } } } } },
      });
      if (!board) throw new NotFoundError('Board');
      if (!board.workspace.members.some((m) => m.userId === req.user!.id)) {
        throw new ForbiddenError('Not a workspace member');
      }

      const last = await prisma.boardColumn.findFirst({
        where: { boardId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const slug = key ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

      const col = await prisma.boardColumn.create({
        data: { boardId, name, key: slug, position: (last?.position ?? 0) + 1000 },
      });
      await prisma.activityLog.create({
        data: {
          workspaceId: board.workspaceId,
          actorId: req.user!.id,
          action: 'COLUMN_ADDED',
          entityType: 'column',
          entityId: col.id,
        },
      });
      res.status(201).json(col);
    } catch (e) { next(e); }
  },
);

// ── Delete column ─────────────────────────────────────────────────────────────
boardsRouter.delete('/:boardId/columns/:columnId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { boardId, columnId } = req.params as { boardId: string; columnId: string };

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        workspace: { include: { members: { select: { userId: true } } } },
        columns: { orderBy: { position: 'asc' } },
      },
    });
    if (!board) throw new NotFoundError('Board');
    if (!board.workspace.members.some((m) => m.userId === req.user!.id)) {
      throw new ForbiddenError('Not a workspace member');
    }

    const column = board.columns.find((c) => c.id === columnId);
    if (!column) throw new NotFoundError('Column');
    if (board.columns.length <= 1) {
      throw new AppError('BAD_REQUEST', 'Cannot delete the only column on the board', 400);
    }

    const fallback =
      board.columns.find((c) => c.key === 'backlog' && c.id !== columnId) ??
      board.columns.find((c) => c.id !== columnId)!;

    await prisma.$transaction(async (tx) => {
      const tasksInColumn = await tx.task.count({ where: { columnId } });
      if (tasksInColumn > 0) {
        const lastInFallback = await tx.task.findFirst({
          where: { columnId: fallback.id },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        let nextPos = (lastInFallback?.position ?? 0) + 1000;
        const tasks = await tx.task.findMany({
          where: { columnId },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        for (const t of tasks) {
          await tx.task.update({ where: { id: t.id }, data: { columnId: fallback.id, position: nextPos } });
          nextPos += 1000;
        }
      }
      await tx.boardColumn.delete({ where: { id: columnId } });
    });

    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Reorder columns ───────────────────────────────────────────────────────────
boardsRouter.patch(
  '/:boardId/columns/reorder',
  validate(z.object({ columnIds: z.array(z.string()).min(1) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params as { boardId: string };
      const { columnIds } = req.body as { columnIds: string[] };

      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: { workspace: { include: { members: { select: { userId: true } } } } },
      });
      if (!board) throw new NotFoundError('Board');
      if (!board.workspace.members.some((m) => m.userId === req.user!.id)) {
        throw new ForbiddenError('Not a workspace member');
      }

      await Promise.all(
        columnIds.map((id, i) =>
          prisma.boardColumn.update({ where: { id }, data: { position: (i + 1) * 1000 } }),
        ),
      );
      await prisma.activityLog.create({
        data: {
          workspaceId: board.workspaceId,
          actorId: req.user!.id,
          action: 'COLUMN_REORDERED',
          entityType: 'board',
          entityId: boardId,
        },
      });
      res.status(204).send();
    } catch (e) { next(e); }
  },
);
