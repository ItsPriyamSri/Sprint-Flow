import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { assertWorkspaceMember } from '../../lib/rbac';
import { AppError, NotFoundError, ForbiddenError, ConflictError } from '../../lib/errors';
import type { Request, Response, NextFunction } from 'express';

export const sprintsRouter: IRouter = Router();
sprintsRouter.use(requireAuth);

function wsId(req: Request): string {
  const id = (req.query['workspaceId'] as string) ?? req.body?.workspaceId;
  if (!id) throw new AppError('BAD_REQUEST', 'workspaceId required', 400);
  return id;
}

async function assertWsAccess(req: Request, minRole: 'VIEWER' | 'MEMBER' = 'VIEWER') {
  const workspaceId = wsId(req);
  await assertWorkspaceMember(req.user!.id, workspaceId, minRole);
  return workspaceId;
}

function sprintToDto(s: {
  id: string; name: string; goal: string | null; days: number; status: string;
  startDate: Date | null; endDate: Date | null; releaseMilestone: boolean;
  releaseLabel: string | null; releaseDate: Date | null; position: number;
  projectId: string | null;
}) {
  return {
    id: s.id,
    name: s.name,
    goal: s.goal,
    days: s.days,
    status: s.status,
    startDate: s.startDate?.toISOString() ?? null,
    endDate: s.endDate?.toISOString() ?? null,
    releaseMilestone: s.releaseMilestone,
    releaseLabel: s.releaseLabel,
    releaseDate: s.releaseDate?.toISOString() ?? null,
    position: s.position,
    projectId: s.projectId,
  };
}

// ── List ──────────────────────────────────────────────────────────────────────
sprintsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = await assertWsAccess(req, 'VIEWER');
    const projectId = req.query['projectId'] as string | undefined;

    const sprints = await prisma.sprint.findMany({
      where: {
        workspaceId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { position: 'asc' },
    });
    res.json({ data: sprints.map(sprintToDto) });
  } catch (e) { next(e); }
});

// ── Sprint board — tasks grouped for the Scrum planning view ──────────────────
sprintsRouter.get('/:sprintId/board', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawSprintId = req.params['sprintId'];
    const sprintId = Array.isArray(rawSprintId) ? rawSprintId[0]! : rawSprintId!;
    const workspaceId = await assertWsAccess(req, 'VIEWER');

    // Fetch sprint with project + members in one query
    const sprintRaw = await prisma.sprint.findUnique({
      where: { id: sprintId },
      include: {
        project: {
          select: {
            id: true, daysPerWeek: true,
            members: {
              where: { user: { role: { not: 'ADMIN' } } },
              include: {
                user: { select: { id: true, name: true, email: true, status: true } },
              },
            },
          },
        },
      },
    });
    if (!sprintRaw) throw new NotFoundError('Sprint');
    if (sprintRaw.workspaceId !== workspaceId) throw new ForbiddenError('Sprint not in this workspace');

    const tasks = await prisma.task.findMany({
      where: { sprintId, workspaceId },
      orderBy: [{ epicId: 'asc' }, { position: 'asc' }],
      include: {
        epic:    { select: { id: true, name: true, color: true, projectId: true } },
        assignments: {
          include: {
            projectMember: {
              select: { id: true, hoursPerDay: true, user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const epics = await prisma.epic.findMany({
      where: {
        workspaceId,
        ...(sprintRaw.projectId ? { projectId: sprintRaw.projectId } : {}),
      },
      select: { id: true, name: true, color: true, projectId: true },
      orderBy: { name: 'asc' },
    });

    // Compute budget and workload from project members
    const projectMembers = sprintRaw.project?.members ?? [];
    const budgetHours = projectMembers.reduce((sum: number, m) => sum + m.hoursPerDay * sprintRaw.days, 0);

    const allAssignments = tasks.flatMap((t) => t.assignments);
    const plannedHours = allAssignments.reduce((sum: number, a) => sum + Number(a.hours), 0);
    const bufferHours = budgetHours - plannedHours;
    const daysPerWeek = sprintRaw.project?.daysPerWeek ?? 6;

    const memberWorkload = projectMembers.map((m) => {
      const memberAssignments = allAssignments.filter((a) => a.projectMemberId === m.id);
      const committedHours = memberAssignments.reduce((sum: number, a) => sum + Number(a.hours), 0);
      const p0Tasks = tasks.filter(
        (t) => t.priority === 'P0' && t.assignments.some((a) => a.projectMemberId === m.id),
      );
      const weeklyCapacity = m.hoursPerDay * daysPerWeek;
      return {
        member: {
          id: m.id,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          hoursPerDay: m.hoursPerDay,
          status: m.user.status,
        },
        committedHours,
        weeklyCapacity,
        p0Count: p0Tasks.length,
        overloaded: committedHours > weeklyCapacity,
      };
    });

    const sprint = sprintRaw;

    res.json({
      sprint: sprintToDto(sprint),
      epics,
      tasks: tasks.map((t) => ({
        id: t.id,
        externalId: t.externalId,
        title: t.title,
        description: t.description,
        notes: t.notes,
        priority: t.priority,
        columnId: t.columnId,
        projectId: t.projectId,
        sprintId: t.sprintId,
        sprintName: sprint.name,
        epicId: t.epicId,
        epicName: t.epic?.name ?? null,
        epicColor: t.epic?.color ?? null,
        done: t.done,
        blocked: t.blocked,
        blockedReason: t.blockedReason,
        deferred: t.deferred,
        deferredReason: t.deferredReason,
        assignments: t.assignments.map((a) => ({
          id: a.id,
          projectMemberId: a.projectMemberId,
          memberName: a.projectMember.user.name,
          hours: Number(a.hours),
          actualHours: a.actualHours != null ? Number(a.actualHours) : null,
        })),
        totalHours: t.assignments.reduce((sum, a) => sum + Number(a.hours), 0),
        position: t.position,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      budgetHours,
      plannedHours,
      bufferHours,
      memberWorkload,
    });
  } catch (e) { next(e); }
});

// ── Create ────────────────────────────────────────────────────────────────────
sprintsRouter.post(
  '/',
  validate(z.object({
    workspaceId: z.string(),
    projectId: z.string().optional(),
    name: z.string().min(1).max(200),
    goal: z.string().max(500).optional(),
    days: z.number().int().min(1).max(30).optional(),
    status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED']).default('PLANNING'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    releaseMilestone: z.boolean().optional().default(false),
    releaseLabel: z.string().max(200).optional(),
    releaseDate: z.string().datetime().optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        workspaceId: string; projectId?: string; name: string; goal?: string; days?: number;
        status: string; startDate?: string; endDate?: string;
        releaseMilestone?: boolean; releaseLabel?: string; releaseDate?: string;
      };
      await assertWorkspaceMember(req.user!.id, body.workspaceId, 'MEMBER');
      const last = await prisma.sprint.findFirst({
        where: { workspaceId: body.workspaceId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const sprint = await prisma.sprint.create({
        data: {
          workspaceId: body.workspaceId,
          projectId: body.projectId,
          name: body.name,
          goal: body.goal,
          days: body.days ?? 6,
          status: body.status as 'PLANNING' | 'ACTIVE' | 'COMPLETED',
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          releaseMilestone: body.releaseMilestone ?? false,
          releaseLabel: body.releaseLabel,
          releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined,
          position: (last?.position ?? 0) + 1000,
        },
      });
      await prisma.activityLog.create({
        data: {
          workspaceId: body.workspaceId,
          actorId: req.user!.id,
          action: 'SPRINT_CREATED',
          entityType: 'sprint',
          entityId: sprint.id,
        },
      });
      res.status(201).json(sprintToDto(sprint));
    } catch (e) { next(e); }
  },
);

// ── Update ────────────────────────────────────────────────────────────────────
sprintsRouter.patch(
  '/:sprintId',
  validate(z.object({
    name: z.string().min(1).max(200).optional(),
    goal: z.string().max(500).optional().nullable(),
    days: z.number().int().min(1).max(30).optional(),
    status: z.enum(['PLANNING', 'ACTIVE', 'COMPLETED']).optional(),
    startDate: z.string().datetime().optional().nullable(),
    endDate: z.string().datetime().optional().nullable(),
    releaseMilestone: z.boolean().optional(),
    releaseLabel: z.string().max(200).optional().nullable(),
    releaseDate: z.string().datetime().optional().nullable(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sprintId = Array.isArray(req.params['sprintId'])
        ? req.params['sprintId'][0]!
        : req.params['sprintId']!;
      const workspaceId = await assertWsAccess(req, 'MEMBER');
      const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
      if (!sprint) throw new NotFoundError('Sprint');
      if (sprint.workspaceId !== workspaceId) {
        throw new ForbiddenError('Sprint not in this workspace');
      }

      const body = req.body as {
        name?: string; goal?: string | null; days?: number; status?: string;
        startDate?: string | null; endDate?: string | null;
        releaseMilestone?: boolean; releaseLabel?: string | null; releaseDate?: string | null;
      };
      const updated = await prisma.sprint.update({
        where: { id: sprintId },
        data: {
          ...(body.name !== undefined              && { name: body.name }),
          ...(body.goal !== undefined              && { goal: body.goal }),
          ...(body.days !== undefined              && { days: body.days }),
          ...(body.status !== undefined            && { status: body.status as 'PLANNING' | 'ACTIVE' | 'COMPLETED' }),
          ...(body.startDate !== undefined         && { startDate: body.startDate ? new Date(body.startDate) : null }),
          ...(body.endDate !== undefined           && { endDate: body.endDate ? new Date(body.endDate) : null }),
          ...(body.releaseMilestone !== undefined  && { releaseMilestone: body.releaseMilestone }),
          ...(body.releaseLabel !== undefined      && { releaseLabel: body.releaseLabel }),
          ...(body.releaseDate !== undefined       && { releaseDate: body.releaseDate ? new Date(body.releaseDate) : null }),
        },
      });

      await prisma.activityLog.create({
        data: {
          workspaceId: sprint.workspaceId,
          actorId: req.user!.id,
          action: 'SPRINT_UPDATED',
          entityType: 'sprint',
          entityId: sprintId,
        },
      });

      res.json(sprintToDto(updated));
    } catch (e) { next(e); }
  },
);

// ── Delete ────────────────────────────────────────────────────────────────────
sprintsRouter.delete('/:sprintId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sprintId = Array.isArray(req.params['sprintId'])
      ? req.params['sprintId'][0]!
      : req.params['sprintId']!;
    const workspaceId = await assertWsAccess(req, 'MEMBER');
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) throw new NotFoundError('Sprint');
    if (sprint.workspaceId !== workspaceId) {
      throw new ForbiddenError('Sprint not in this workspace');
    }

    const taskCount = await prisma.task.count({ where: { sprintId } });
    if (taskCount > 0) {
      throw new ConflictError('Cannot delete a sprint that has tasks assigned to it');
    }

    await prisma.sprint.delete({ where: { id: sprintId } });
    res.status(204).send();
  } catch (e) { next(e); }
});
