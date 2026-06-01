import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as svc from './tasks.service';
import { AppError } from '../../lib/errors';
import type { Request, Response, NextFunction } from 'express';

export const tasksRouter: IRouter = Router();
tasksRouter.use(requireAuth);

function wsId(req: Request): string {
  const raw = req.query['workspaceId'];
  const fromQuery = Array.isArray(raw) ? (raw[0] as string | undefined) : (raw as string | undefined);
  const id: string | undefined = fromQuery ?? (req.body?.workspaceId as string | undefined);
  if (!id) throw new AppError('BAD_REQUEST', 'workspaceId required', 400);
  return id;
}

function paramStr(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : (v ?? '');
}

function serializeTask(task: Awaited<ReturnType<typeof svc.getTask>>) {
  return {
    ...task,
    assignments: svc.serializeAssignments(task.assignments as Parameters<typeof svc.serializeAssignments>[0]),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    comments: task.comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

// ── Create ────────────────────────────────────────────────────────────────────
tasksRouter.post(
  '/',
  validate(
    z.object({
      workspaceId: z.string(),
      boardId: z.string(),
      columnId: z.string(),
      projectId: z.string().optional(),
      title: z.string().min(1).max(500),
      description: z.string().max(10000).optional(),
      notes: z.string().max(10000).optional(),
      priority: z.enum(['P0', 'P1', 'P2']).optional(),
      sprintId: z.string().optional(),
      epicId: z.string().optional(),
      externalId: z.string().max(50).optional(),
      done: z.boolean().optional(),
      deferred: z.boolean().optional(),
      deferredReason: z.string().max(500).optional().nullable(),
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const created = await svc.createTask(req.user!.id, req.body);
      const task = await svc.getTask(created.id, (req.body as { workspaceId: string }).workspaceId);
      res.status(201).json(serializeTask(task));
    } catch (e) { next(e); }
  },
);

// ── Get detail ────────────────────────────────────────────────────────────────
tasksRouter.get('/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await svc.getTask(paramStr(req, 'taskId'), wsId(req));
    res.json(serializeTask(task));
  } catch (e) { next(e); }
});

// ── Update ────────────────────────────────────────────────────────────────────
tasksRouter.patch(
  '/:taskId',
  validate(
    z.object({
      title:         z.string().min(1).max(500).optional(),
      description:   z.string().max(10000).optional().nullable(),
      notes:         z.string().max(10000).optional().nullable(),
      priority:      z.enum(['P0', 'P1', 'P2']).optional().nullable(),
      sprintId:      z.string().optional().nullable(),
      epicId:        z.string().optional().nullable(),
      columnId:      z.string().optional(),
      externalId:    z.string().max(50).optional().nullable(),
      done:          z.boolean().optional(),
      deferred:      z.boolean().optional(),
      deferredReason: z.string().max(500).optional().nullable(),
      projectId:     z.string().optional().nullable(),
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = paramStr(req, 'taskId');
      const workspaceId = wsId(req);
      await svc.updateTask(taskId, workspaceId, req.user!.id, req.body);
      const task = await svc.getTask(taskId, workspaceId);
      res.json(serializeTask(task));
    } catch (e) { next(e); }
  },
);

// ── Move (drag-drop) ──────────────────────────────────────────────────────────
tasksRouter.patch(
  '/:taskId/move',
  validate(z.object({ columnId: z.string(), position: z.number() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await svc.moveTask(
        paramStr(req, 'taskId'),
        wsId(req),
        req.user!.id,
        req.body as { columnId: string; position: number },
      );
      res.json(task);
    } catch (e) { next(e); }
  },
);

// ── Delete ────────────────────────────────────────────────────────────────────
tasksRouter.delete('/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await svc.deleteTask(paramStr(req, 'taskId'), wsId(req), req.user!.id);
    res.status(204).send();
  } catch (e) { next(e); }
});

// ── Upsert assignment ────────────────────────────────────────────────────────
tasksRouter.put(
  '/:taskId/assignments/:projectMemberId',
  validate(z.object({ hours: z.number().min(0).max(1000) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignment = await svc.upsertAssignment(
        paramStr(req, 'taskId'),
        wsId(req),
        paramStr(req, 'projectMemberId'),
        (req.body as { hours: number }).hours,
      );
      res.json(assignment);
    } catch (e) { next(e); }
  },
);

// ── Delete assignment ─────────────────────────────────────────────────────────
tasksRouter.delete(
  '/:taskId/assignments/:projectMemberId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await svc.removeAssignment(
        paramStr(req, 'taskId'),
        wsId(req),
        paramStr(req, 'projectMemberId'),
      );
      res.status(204).send();
    } catch (e) { next(e); }
  },
);

// ── Comments ─────────────────────────────────────────────────────────────────
tasksRouter.post(
  '/:taskId/comments',
  validate(z.object({ body: z.string().min(1).max(5000) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const comment = await svc.createComment(
        paramStr(req, 'taskId'),
        wsId(req),
        req.user!.id,
        (req.body as { body: string }).body,
      );
      res.status(201).json(comment);
    } catch (e) { next(e); }
  },
);
