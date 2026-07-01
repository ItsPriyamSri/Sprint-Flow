import { Router, type IRouter } from 'express';
import { requireAuth, requireWorkspaceRole } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ForbiddenError } from '../../lib/errors';

export const workspacesRouter: IRouter = Router();
workspacesRouter.use(requireAuth);

// Shared hydration helper — returns the full project/sprints/epics/boards bundle for a workspace.
async function hydrateWorkspace(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
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
      // Legacy workspace-scoped sprints (null projectId)
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
  });
  if (!ws) return null;
  return ws;
}

function formatWorkspace(ws: NonNullable<Awaited<ReturnType<typeof hydrateWorkspace>>>, role: string) {
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    description: ws.description,
    role,
    boards: ws.boards,
    sprints: ws.sprints.map((s) => ({
      id: s.id, name: s.name, status: s.status, goal: s.goal, days: s.days,
      position: s.position, projectId: s.projectId,
    })),
    epics: ws.epics,
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
  };
}

// GET /workspaces — list all teams the caller belongs to.
// Super admin gets ALL workspaces; regular users get only their memberships.
workspacesRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    if (isSuperAdmin) {
      const allWorkspaces = await prisma.workspace.findMany({
        where: { archivedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, description: true },
      });
      res.json(allWorkspaces.map((w) => ({ ...w, role: 'OWNER' })));
    } else {
      const memberships = await prisma.workspaceMember.findMany({
        where: { userId },
        include: { workspace: { select: { id: true, name: true, slug: true, description: true, archivedAt: true } } },
        orderBy: { joinedAt: 'asc' },
      });
      res.json(
        memberships
          .filter((m) => m.workspace.archivedAt == null)
          .map((m) => ({
            id: m.workspace.id,
            name: m.workspace.name,
            slug: m.workspace.slug,
            description: m.workspace.description,
            role: m.role,
          })),
      );
    }
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/mine — returns the user's first workspace with full hydration (legacy / single-team compat).
workspacesRouter.get('/mine', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    let workspaceId: string | null = null;
    let role = 'MEMBER';

    if (isSuperAdmin) {
      const first = await prisma.workspace.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' } });
      workspaceId = first?.id ?? null;
      role = 'OWNER';
    } else {
      const membership = await prisma.workspaceMember.findFirst({
        where: { userId },
        orderBy: { joinedAt: 'asc' },
      });
      workspaceId = membership?.workspaceId ?? null;
      role = membership?.role ?? 'MEMBER';
    }

    if (!workspaceId) throw new NotFoundError('Workspace');

    const ws = await hydrateWorkspace(workspaceId);
    if (!ws) throw new NotFoundError('Workspace');

    res.json(formatWorkspace(ws, role));
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:workspaceId/hydrate — full hydration for a specific team.
workspacesRouter.get('/:workspaceId/hydrate', async (req, res, next) => {
  try {
    const { workspaceId } = req.params as { workspaceId: string };
    const userId = req.user!.id;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    let role = 'MEMBER';
    if (!isSuperAdmin) {
      const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
      });
      if (!membership) throw new ForbiddenError('Not a member of this team');
      role = membership.role;
    } else {
      role = 'OWNER';
    }

    const ws = await hydrateWorkspace(workspaceId);
    if (!ws) throw new NotFoundError('Workspace');

    res.json(formatWorkspace(ws, role));
  } catch (e) {
    next(e);
  }
});

// GET /workspaces/:workspaceId — basic workspace info (boards, sprints, projects summary)
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
