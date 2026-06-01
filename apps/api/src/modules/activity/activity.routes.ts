import { Router, type IRouter } from 'express';
import { requireAuth } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import type { Request, Response, NextFunction } from 'express';

export const activityRouter: IRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = (req.query['workspaceId'] as string);
    if (!workspaceId) throw new AppError('BAD_REQUEST', 'workspaceId required', 400);

    const entityId = req.query['entityId'] as string | undefined;
    const cursor   = req.query['cursor']   as string | undefined;
    const limit    = Math.min(parseInt((req.query['limit'] as string) ?? '20', 10), 100);

    const logs = await prisma.activityLog.findMany({
      where: {
        workspaceId,
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, name: true } } },
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;

    res.json({
      data: data.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        diff: l.diff,
        actor: l.actor,
        createdAt: l.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
    });
  } catch (e) { next(e); }
});
