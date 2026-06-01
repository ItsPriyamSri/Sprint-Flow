import { Router, type IRouter } from 'express';
import { requireAuth, requireWorkspaceRole } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';

export const workspacesRouter: IRouter = Router();
workspacesRouter.use(requireAuth);

// GET /workspaces/mine — returns the user's first workspace with projects/sprints/epics
workspacesRouter.get('/mine', async (req, res, next) => {
  try {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: req.user!.id },
      include: {
        workspace: {
          include: {
            boards: { select: { id: true, name: true }, take: 1 },
            projects: {
              include: {
                members: {
                  include: { user: { select: { id: true, name: true, email: true, status: true } } },
                  orderBy: { joinedAt: 'asc' },
                },
                sprints: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true, name: true, goal: true, days: true, status: true,
                    startDate: true, endDate: true, releaseMilestone: true,
                    releaseLabel: true, releaseDate: true, position: true, projectId: true,
                  },
                },
                epics: {
                  orderBy: { name: 'asc' },
                  select: { id: true, name: true, color: true, projectId: true },
                },
              },
              orderBy: { createdAt: 'asc' },
              take: 10,
            },
            // Legacy: workspace-scoped sprints (null projectId)
            sprints: {
              where: { projectId: null },
              orderBy: { position: 'asc' },
              select: { id: true, name: true, status: true, goal: true, days: true, position: true, projectId: true },
            },
            epics: {
              where: { projectId: null },
              select: { id: true, name: true, color: true, projectId: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
    if (!membership) throw new NotFoundError('Workspace');

    const ws = membership.workspace;
    res.json({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      role: membership.role,
      boards: ws.boards,
      // Legacy sprints (workspace-scoped, no project)
      sprints: ws.sprints.map((s) => ({
        id: s.id, name: s.name, status: s.status, goal: s.goal, days: s.days,
        position: s.position, projectId: s.projectId,
      })),
      epics: ws.epics,
      // Projects with members
      projects: ws.projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        daysPerSprint: p.daysPerSprint,
        daysPerWeek: p.daysPerWeek,
        releaseDate: p.releaseDate?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        members: p.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          hoursPerDay: m.hoursPerDay,
          status: m.user.status,
        })),
        sprints: p.sprints.map((s) => ({
          id: s.id, name: s.name, goal: s.goal, days: s.days, status: s.status,
          startDate: s.startDate?.toISOString() ?? null,
          endDate: s.endDate?.toISOString() ?? null,
          releaseMilestone: s.releaseMilestone,
          releaseLabel: s.releaseLabel,
          releaseDate: s.releaseDate?.toISOString() ?? null,
          position: s.position,
          projectId: s.projectId,
        })),
        epics: p.epics,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:workspaceId
workspacesRouter.get('/:workspaceId', requireWorkspaceRole('VIEWER'), async (req, res, next) => {
  try {
    const { workspaceId } = req.params as { workspaceId: string };
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        boards:   { select: { id: true, name: true }, take: 1 },
        sprints:  { orderBy: { position: 'asc' }, select: { id: true, name: true, status: true } },
        projects: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, status: true } } },
        },
      },
    });
    if (!workspace) throw new NotFoundError('Workspace');
    res.json(workspace);
  } catch (e) {
    next(e);
  }
});
