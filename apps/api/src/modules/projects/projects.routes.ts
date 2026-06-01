import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { assertWorkspaceMember } from '../../lib/rbac';
import { NotFoundError, ForbiddenError, AppError } from '../../lib/errors';
import type { Request, Response, NextFunction } from 'express';

export const projectsRouter: IRouter = Router();
projectsRouter.use(requireAuth);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function memberDto(m: {
  id: string; userId: string; role: string; hoursPerDay: number;
  user: { id: string; name: string; email: string | null; status: string };
}) {
  return {
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    hoursPerDay: m.hoursPerDay,
    status: m.user.status,
  };
}

function sprintDto(s: {
  id: string; name: string; goal: string | null; days: number; status: string;
  startDate: Date | null; endDate: Date | null; releaseMilestone: boolean;
  releaseLabel: string | null; releaseDate: Date | null; position: number; projectId: string | null;
}) {
  return {
    id: s.id, name: s.name, goal: s.goal, days: s.days, status: s.status,
    startDate: s.startDate?.toISOString() ?? null,
    endDate: s.endDate?.toISOString() ?? null,
    releaseMilestone: s.releaseMilestone,
    releaseLabel: s.releaseLabel,
    releaseDate: s.releaseDate?.toISOString() ?? null,
    position: s.position,
    projectId: s.projectId,
  };
}

async function assertProjectAccess(
  projectId: string,
  userId: string,
  minRole: 'VIEWER' | 'MEMBER' = 'VIEWER',
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { workspace: { include: { members: { select: { userId: true } } } } },
  });
  if (!project) throw new NotFoundError('Project');
  await assertWorkspaceMember(userId, project.workspaceId, minRole);
  return project;
}

async function assertProjectMemberBelongs(projectId: string, memberId: string) {
  const member = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId },
  });
  if (!member) throw new NotFoundError('Project member');
  return member;
}

// ── List projects for workspace ───────────────────────────────────────────────
projectsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.query['workspaceId'] as string;
    if (!workspaceId) {
      const membership = await prisma.workspaceMember.findFirst({ where: { userId: req.user!.id } });
      if (!membership) return res.json({ data: [] });
      const projects = await getProjectList(membership.workspaceId, req.user!.id);
      return res.json({ data: projects });
    }
    const projects = await getProjectList(workspaceId, req.user!.id);
    res.json({ data: projects });
  } catch (e) { next(e); }
});

async function getProjectList(workspaceId: string, _userId: string) {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, status: true } } } },
      sprints: {
        orderBy: { position: 'asc' as const },
        select: {
          id: true, name: true, goal: true, days: true, status: true,
          startDate: true, endDate: true, releaseMilestone: true,
          releaseLabel: true, releaseDate: true, position: true, projectId: true,
        },
      },
      epics: { orderBy: { name: 'asc' as const }, select: { id: true, name: true, color: true, projectId: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  });

  return projects.map((p) => ({
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    description: p.description,
    daysPerSprint: p.daysPerSprint,
    daysPerWeek: p.daysPerWeek,
    releaseDate: p.releaseDate?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    members: p.members.map(memberDto),
    sprints: p.sprints.map(sprintDto),
    epics: p.epics,
  }));
}

// ── Get project overview ──────────────────────────────────────────────────────
projectsRouter.get('/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params as { projectId: string };
    await assertProjectAccess(projectId, req.user!.id);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, status: true } } } },
        sprints: { orderBy: { position: 'asc' } },
        epics:   { orderBy: { name: 'asc' }, select: { id: true, name: true, color: true, projectId: true } },
      },
    });
    if (!project) throw new NotFoundError('Project');

    // Per-sprint health data
    const allSprintIds = project.sprints.map((s) => s.id);

    const allTasks = await prisma.task.findMany({
      where: { sprintId: { in: allSprintIds } },
      select: {
        id: true, sprintId: true, priority: true, done: true, updatedAt: true,
        assignments: { select: { projectMemberId: true, hours: true } },
      },
    });

    // Tasks completed this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const tasksCompletedThisWeek = allTasks.filter(
      (t) => t.done && t.updatedAt >= weekAgo,
    ).length;

    const budgetPerSprint = (sprint: typeof project.sprints[0]) =>
      project.members.reduce((sum, m) => sum + m.hoursPerDay * sprint.days, 0);

    const sprintHealth = project.sprints.map((sprint) => {
      const sprintTasks = allTasks.filter((t) => t.sprintId === sprint.id);
      const plannedHours = sprintTasks.reduce(
        (sum, t) => sum + t.assignments.reduce((s, a) => s + Number(a.hours), 0),
        0,
      );
      const budget = budgetPerSprint(sprint);

      const memberWorkload = project.members.map((m) => {
        const committed = sprintTasks.reduce((sum, t) => {
          const a = t.assignments.find((a) => a.projectMemberId === m.id);
          return sum + (a ? Number(a.hours) : 0);
        }, 0);
        const p0Count = sprintTasks.filter(
          (t) => t.priority === 'P0' && t.assignments.some((a) => a.projectMemberId === m.id),
        ).length;
        const weeklyCapacity = m.hoursPerDay * project.daysPerWeek;
        return {
          member: memberDto(m),
          committedHours: committed,
          weeklyCapacity,
          p0Count,
          overloaded: committed > weeklyCapacity,
        };
      });

      return {
        sprint: sprintDto(sprint),
        budgetHours: budget,
        plannedHours,
        bufferHours: budget - plannedHours,
        completedTasks: sprintTasks.filter((t) => t.done).length,
        totalTasks: sprintTasks.length,
        memberWorkload,
      };
    });

    // Current sprint = first ACTIVE, else first PLANNING
    const currentSprintHealth =
      sprintHealth.find((sh) => sh.sprint.status === 'ACTIVE') ??
      sprintHealth.find((sh) => sh.sprint.status === 'PLANNING') ??
      null;

    // Days to next release
    const upcomingRelease = project.sprints
      .filter((s) => s.releaseMilestone && s.releaseDate && s.releaseDate > new Date())
      .sort((a, b) => a.releaseDate!.getTime() - b.releaseDate!.getTime())[0];
    const daysToNextRelease = upcomingRelease?.releaseDate
      ? Math.ceil((upcomingRelease.releaseDate.getTime() - Date.now()) / 86400000)
      : null;

    res.json({
      project: {
        id: project.id,
        workspaceId: project.workspaceId,
        name: project.name,
        description: project.description,
        daysPerSprint: project.daysPerSprint,
        daysPerWeek: project.daysPerWeek,
        releaseDate: project.releaseDate?.toISOString() ?? null,
        createdAt: project.createdAt.toISOString(),
        members: project.members.map(memberDto),
        sprints: project.sprints.map(sprintDto),
        epics: project.epics,
      },
      currentSprint: currentSprintHealth,
      allSprints: sprintHealth,
      daysToNextRelease,
      tasksCompletedThisWeek,
    });
  } catch (e) { next(e); }
});

// ── Create project (transactional wizard) ─────────────────────────────────────
projectsRouter.post(
  '/',
  validate(
    z.object({
      workspaceId: z.string(),
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      daysPerSprint: z.number().int().min(1).max(30).default(6),
      daysPerWeek: z.number().int().min(1).max(7).default(6),
      releaseDate: z.string().datetime().optional(),
      members: z.array(z.object({
        userId: z.string(),
        role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).default('MEMBER'),
        hoursPerDay: z.number().min(0.5).max(24).default(6),
      })).min(1),
      sprints: z.array(z.object({
        name: z.string().min(1).max(200),
        goal: z.string().max(500).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        releaseMilestone: z.boolean().default(false),
        releaseLabel: z.string().max(200).optional(),
        releaseDate: z.string().datetime().optional(),
      })).min(1).max(12),
      epicNames: z.array(z.string().min(1).max(200)).optional().default([]),
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as {
        workspaceId: string; name: string; description?: string;
        daysPerSprint: number; daysPerWeek: number; releaseDate?: string;
        members: Array<{ userId: string; role: string; hoursPerDay: number }>;
        sprints: Array<{
          name: string; goal?: string; startDate?: string; endDate?: string;
          releaseMilestone: boolean; releaseLabel?: string; releaseDate?: string;
        }>;
        epicNames: string[];
      };

      // Verify caller is a workspace member
      const wsMembership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: req.user!.id, workspaceId: body.workspaceId } },
      });
      if (!wsMembership) throw new ForbiddenError('Not a workspace member');
      if (wsMembership.role === 'VIEWER') {
        throw new ForbiddenError('Viewers cannot create projects');
      }

      const memberUserIds = body.members.map((m) => m.userId);
      const validMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId: body.workspaceId, userId: { in: memberUserIds } },
        select: { userId: true },
      });
      if (validMembers.length !== memberUserIds.length) {
        throw new AppError('BAD_REQUEST', 'All project members must belong to the workspace', 400);
      }

      const project = await prisma.$transaction(async (tx) => {
        const p = await tx.project.create({
          data: {
            workspaceId: body.workspaceId,
            name: body.name,
            description: body.description,
            daysPerSprint: body.daysPerSprint,
            daysPerWeek: body.daysPerWeek,
            releaseDate: body.releaseDate ? new Date(body.releaseDate) : undefined,
          },
        });

        // Create project members
        await tx.projectMember.createMany({
          data: body.members.map((m) => ({
            projectId: p.id,
            userId: m.userId,
            role: m.role as 'LEAD' | 'MEMBER' | 'VIEWER',
            hoursPerDay: m.hoursPerDay,
          })),
          skipDuplicates: true,
        });

        // Create sprints
        for (let i = 0; i < body.sprints.length; i++) {
          const s = body.sprints[i]!;
          await tx.sprint.create({
            data: {
              workspaceId: body.workspaceId,
              projectId: p.id,
              name: s.name,
              goal: s.goal,
              days: body.daysPerSprint,
              status: 'PLANNING',
              startDate: s.startDate ? new Date(s.startDate) : undefined,
              endDate: s.endDate ? new Date(s.endDate) : undefined,
              releaseMilestone: s.releaseMilestone,
              releaseLabel: s.releaseLabel,
              releaseDate: s.releaseDate ? new Date(s.releaseDate) : undefined,
              position: (i + 1) * 1000,
            },
          });
        }

        // Create epics
        for (const epicName of body.epicNames) {
          await tx.epic.upsert({
            where: { workspaceId_name: { workspaceId: body.workspaceId, name: epicName } },
            update: { projectId: p.id },
            create: { workspaceId: body.workspaceId, projectId: p.id, name: epicName },
          });
        }

        await tx.activityLog.create({
          data: {
            workspaceId: body.workspaceId,
            actorId: req.user!.id,
            action: 'PROJECT_CREATED',
            entityType: 'project',
            entityId: p.id,
            diff: { after: { name: p.name } },
          },
        });

        return p;
      });

      // Return full project data
      const full = await prisma.project.findUnique({
        where: { id: project.id },
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, status: true } } } },
          sprints: { orderBy: { position: 'asc' } },
          epics:   { orderBy: { name: 'asc' }, select: { id: true, name: true, color: true, projectId: true } },
        },
      });

      res.status(201).json({
        id: full!.id,
        workspaceId: full!.workspaceId,
        name: full!.name,
        description: full!.description,
        daysPerSprint: full!.daysPerSprint,
        daysPerWeek: full!.daysPerWeek,
        releaseDate: full!.releaseDate?.toISOString() ?? null,
        createdAt: full!.createdAt.toISOString(),
        members: full!.members.map(memberDto),
        sprints: full!.sprints.map(sprintDto),
        epics: full!.epics,
      });
    } catch (e) { next(e); }
  },
);

// ── Update project ────────────────────────────────────────────────────────────
projectsRouter.patch(
  '/:projectId',
  validate(z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    daysPerSprint: z.number().int().min(1).max(30).optional(),
    daysPerWeek: z.number().int().min(1).max(7).optional(),
    releaseDate: z.string().datetime().optional().nullable(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params as { projectId: string };
      await assertProjectAccess(projectId, req.user!.id, 'MEMBER');
      const body = req.body as {
        name?: string; description?: string | null;
        daysPerSprint?: number; daysPerWeek?: number; releaseDate?: string | null;
      };
      const updated = await prisma.project.update({
        where: { id: projectId },
        data: {
          ...(body.name !== undefined          && { name: body.name }),
          ...(body.description !== undefined   && { description: body.description }),
          ...(body.daysPerSprint !== undefined && { daysPerSprint: body.daysPerSprint }),
          ...(body.daysPerWeek !== undefined   && { daysPerWeek: body.daysPerWeek }),
          ...(body.releaseDate !== undefined   && { releaseDate: body.releaseDate ? new Date(body.releaseDate) : null }),
        },
      });
      res.json({ id: updated.id, name: updated.name, description: updated.description });
    } catch (e) { next(e); }
  },
);

// ── Update project member capacity ────────────────────────────────────────────
projectsRouter.patch(
  '/:projectId/members/:memberId',
  validate(z.object({
    role: z.enum(['LEAD', 'MEMBER', 'VIEWER']).optional(),
    hoursPerDay: z.number().min(0.5).max(24).optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, memberId } = req.params as { projectId: string; memberId: string };
      await assertProjectAccess(projectId, req.user!.id, 'MEMBER');
      await assertProjectMemberBelongs(projectId, memberId);
      const body = req.body as { role?: string; hoursPerDay?: number };
      const updated = await prisma.projectMember.update({
        where: { id: memberId },
        data: {
          ...(body.role !== undefined        && { role: body.role as 'LEAD' | 'MEMBER' | 'VIEWER' }),
          ...(body.hoursPerDay !== undefined && { hoursPerDay: body.hoursPerDay }),
        },
        include: { user: { select: { id: true, name: true, email: true, status: true } } },
      });
      res.json(memberDto(updated));
    } catch (e) { next(e); }
  },
);

// ── Update project epic ────────────────────────────────────────────────────────
projectsRouter.patch(
  '/:projectId/epics/:epicId',
  validate(z.object({
    name: z.string().min(1).max(200).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, epicId } = req.params as { projectId: string; epicId: string };
      await assertProjectAccess(projectId, req.user!.id, 'MEMBER');
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundError('Project');

      const epic = await prisma.epic.findFirst({ where: { id: epicId, projectId } });
      if (!epic) throw new NotFoundError('Epic');

      const body = req.body as { name?: string; color?: string };

      if (body.name) {
        const existing = await prisma.epic.findFirst({
          where: { workspaceId: project.workspaceId, name: body.name, id: { not: epicId } },
        });
        if (existing) {
          throw new AppError('BAD_REQUEST', 'An epic with this name already exists in the workspace', 400);
        }
      }

      const updated = await prisma.epic.update({
        where: { id: epicId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.color !== undefined && { color: body.color }),
        },
      });

      res.json({ id: updated.id, name: updated.name, color: updated.color, projectId: updated.projectId });
    } catch (e) { next(e); }
  },
);


// ── My Work endpoint ──────────────────────────────────────────────────────────
// GET /projects/:projectId/my-work — assignments + dynamic day targets for current user
projectsRouter.get('/:projectId/my-work', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params as { projectId: string };
    await assertProjectAccess(projectId, req.user!.id);

    // Find the ProjectMember record for this user
    const projectMember = await prisma.projectMember.findFirst({
      where: { projectId, userId: req.user!.id },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    });
    if (!projectMember) throw new ForbiddenError('You are not a member of this project');

    // Active sprint
    const currentSprint = await prisma.sprint.findFirst({
      where: { projectId, status: { in: ['ACTIVE', 'PLANNING'] } },
      orderBy: { position: 'asc' },
    });

    // Tasks assigned to this member
    const assignments = await prisma.taskAssignment.findMany({
      where: { projectMemberId: projectMember.id },
      include: {
        task: {
          include: {
            sprint:  { select: { id: true, name: true, status: true } },
            epic:    { select: { id: true, name: true, color: true, projectId: true } },
            assignments: {
              include: {
                projectMember: { select: { id: true, user: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
    });

    // Compute days remaining in current sprint
    let daysRemaining = currentSprint?.days ?? 6;
    if (currentSprint?.endDate) {
      const diff = Math.ceil((currentSprint.endDate.getTime() - Date.now()) / 86400000);
      daysRemaining = Math.max(1, diff);
    }

    function taskToDto(a: typeof assignments[0]) {
      const t = a.task;
      const totalHours = t.assignments.reduce((sum, x) => sum + Number(x.hours), 0);
      const myHours = Number(a.hours);
      const dailyTarget = daysRemaining > 0 ? Math.round((myHours / daysRemaining) * 10) / 10 : myHours;
      return {
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
        assignments: t.assignments.map((x) => ({
          id: x.id,
          projectMemberId: x.projectMemberId,
          memberName: x.projectMember.user.name,
          hours: Number(x.hours),
        })),
        totalHours,
        position: t.position,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        myHours,
        dailyTarget,
      };
    }

    const currentSprintTasks = assignments
      .filter((a) => a.task.sprintId === currentSprint?.id && !a.task.deferred)
      .map(taskToDto)
      .sort((a, b) => {
        const pOrder = { P0: 0, P1: 1, P2: 2 };
        const pa = pOrder[a.priority as 'P0' | 'P1' | 'P2'] ?? 9;
        const pb = pOrder[b.priority as 'P0' | 'P1' | 'P2'] ?? 9;
        return pa - pb;
      });

    // Today's focus: top P0 + P1 undone tasks, max 3
    const todayFocus = currentSprintTasks.filter((t) => !t.done).slice(0, 3);

    const upcomingTasks = assignments
      .filter((a) => {
        if (!a.task.sprintId || a.task.sprintId === currentSprint?.id) return false;
        const s = a.task.sprint;
        return s && (s.status === 'PLANNING');
      })
      .map(taskToDto);

    res.json({
      member: memberDto({ ...projectMember, user: projectMember.user }),
      currentSprint: currentSprint
        ? {
            id: currentSprint.id, name: currentSprint.name, goal: currentSprint.goal,
            days: currentSprint.days, status: currentSprint.status,
            startDate: currentSprint.startDate?.toISOString() ?? null,
            endDate: currentSprint.endDate?.toISOString() ?? null,
            releaseMilestone: currentSprint.releaseMilestone,
            releaseLabel: currentSprint.releaseLabel,
            releaseDate: currentSprint.releaseDate?.toISOString() ?? null,
            position: currentSprint.position,
            projectId: currentSprint.projectId,
          }
        : null,
      todayFocus,
      currentSprintTasks,
      upcomingTasks,
      daysRemaining,
    });
  } catch (e) { next(e); }
});

// ── Backlog view ─────────────────────────────────────────────────────────────
// GET /projects/:projectId/backlog — tasks that are deferred=true or sprintId=null
projectsRouter.get('/:projectId/backlog', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params as { projectId: string };
    await assertProjectAccess(projectId, req.user!.id);

    const tasks = await prisma.task.findMany({
      where: {
        projectId,
        OR: [
          { sprintId: null },
          { deferred: true },
        ],
      },
      include: {
        epic:   { select: { id: true, name: true, color: true, projectId: true } },
        sprint: { select: { id: true, name: true, status: true } },
        assignments: {
          include: {
            projectMember: { select: { id: true, user: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { position: 'asc' }],
    });

    const data = tasks.map((t) => {
      const totalHours = t.assignments.reduce((sum, a) => sum + Number(a.hours), 0);
      return {
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
        totalHours,
        position: t.position,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    res.json({ data });
  } catch (e) { next(e); }
});

// ── Team view ────────────────────────────────────────────────────────────────
projectsRouter.get('/:projectId/team', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params as { projectId: string };
    await assertProjectAccess(projectId, req.user!.id);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, status: true } } } },
        sprints: { orderBy: { position: 'asc' } },
      },
    });
    if (!project) throw new NotFoundError('Project');

    const allAssignments = await prisma.taskAssignment.findMany({
      where: { projectMember: { projectId } },
      include: {
        task: { select: { sprintId: true, priority: true, done: true } },
      },
    });

    const teamData = project.members.map((m) => {
      const memberAssignments = allAssignments.filter((a) => a.projectMemberId === m.id);
      const totalHours = memberAssignments.reduce((sum, a) => sum + Number(a.hours), 0);
      const weeklyCapacity = m.hoursPerDay * project.daysPerWeek;
      const totalCapacity = weeklyCapacity * project.sprints.length;

      const perSprint = project.sprints.map((s: { id: string; name: string; days: number; status: string }) => {
        const sprintAssignments = memberAssignments.filter((a) => a.task.sprintId === s.id);
        const sprintHours = sprintAssignments.reduce((sum: number, a) => sum + Number(a.hours), 0);
        const sprintBudget = m.hoursPerDay * s.days;
        return {
          sprintId: s.id,
          sprintName: s.name,
          committedHours: sprintHours,
          budgetHours: sprintBudget,
          overloaded: sprintHours > sprintBudget,
        };
      });

      return {
        member: memberDto(m),
        totalCommittedHours: totalHours,
        totalCapacityHours: totalCapacity,
        weeklyCapacity,
        perSprint,
        overloaded: perSprint.some((s) => s.overloaded),
      };
    });

    res.json({ project: { id: project.id, name: project.name }, team: teamData });
  } catch (e) { next(e); }
});
