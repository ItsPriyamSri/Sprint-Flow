import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth, requireSuperAdmin, requireTeamAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { env } from '../../lib/env';
import { NotFoundError, ForbiddenError, ConflictError, AppError } from '../../lib/errors';
import type { Request, Response, NextFunction } from 'express';

export const teamsRouter: IRouter = Router();
teamsRouter.use(requireAuth);

const GETI_DOMAIN = '@geti.education';

// ── POST /teams — create a new team (super admin only) ───────────────────────
teamsRouter.post(
  '/',
  requireSuperAdmin,
  validate(z.object({
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens'),
    description: z.string().max(300).optional(),
    leadEmail: z.string().email().refine((e) => e.endsWith(GETI_DOMAIN), {
      message: 'Lead must be a @geti.education email',
    }).optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, slug, description, leadEmail } = req.body as {
        name: string; slug: string; description?: string; leadEmail?: string;
      };

      const existing = await prisma.workspace.findUnique({ where: { slug } });
      if (existing) throw new ConflictError('A team with this slug already exists');

      const workspace = await prisma.workspace.create({
        data: { name, slug, description: description ?? null },
      });

      // If a lead email is specified, find or create the user and make them OWNER
      if (leadEmail) {
        let lead = await prisma.user.findUnique({ where: { email: leadEmail } });
        if (!lead) {
          if (!env.DEFAULT_MEMBER_PASSWORD) {
            throw new AppError('INTERNAL', 'DEFAULT_MEMBER_PASSWORD is not configured', 500);
          }
          const ph = await hashPassword(env.DEFAULT_MEMBER_PASSWORD);
          const nameParts = leadEmail.split('@')[0]!.split(/[._]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
          lead = await prisma.user.create({
            data: {
              email: leadEmail,
              name: nameParts.join(' '),
              passwordHash: ph,
              role: 'MEMBER',
              status: 'ACTIVE',
              mustChangePassword: true,
            },
          });
        }
        await prisma.workspaceMember.upsert({
          where: { userId_workspaceId: { userId: lead.id, workspaceId: workspace.id } },
          update: { role: 'OWNER' },
          create: { userId: lead.id, workspaceId: workspace.id, role: 'OWNER' },
        });
      }

      res.status(201).json({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        description: workspace.description,
      });
    } catch (e) { next(e); }
  },
);

// ── GET /teams — list all teams (super admin) ────────────────────────────────
teamsRouter.get('/', requireSuperAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const teams = await prisma.workspace.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
          where: { role: { in: ['OWNER', 'ADMIN'] } },
        },
        _count: { select: { members: true, projects: true } },
      },
    });

    res.json(teams.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      memberCount: t._count.members,
      projectCount: t._count.projects,
      leads: t.members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    })));
  } catch (e) { next(e); }
});

// ── PATCH /teams/:teamId — rename / edit team (team lead or super admin) ─────
teamsRouter.patch(
  '/:teamId',
  requireTeamAdmin,
  validate(z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(300).optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId } = req.params as { teamId: string };
      const { name, description } = req.body as { name?: string; description?: string };

      const team = await prisma.workspace.findUnique({ where: { id: teamId } });
      if (!team) throw new NotFoundError('Team');

      const updated = await prisma.workspace.update({
        where: { id: teamId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
        select: { id: true, name: true, slug: true, description: true },
      });

      res.json(updated);
    } catch (e) { next(e); }
  },
);

// ── GET /teams/:teamId/members — list team members ───────────────────────────
teamsRouter.get('/:teamId/members', requireTeamAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.params as { teamId: string };

    const team = await prisma.workspace.findUnique({ where: { id: teamId } });
    if (!team) throw new NotFoundError('Team');

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: teamId },
      include: {
        user: {
          select: {
            id: true, email: true, name: true, role: true, status: true,
            mustChangePassword: true,
            projectMemberships: { select: { id: true, projectId: true, role: true } },
            linkedNames: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    // Fetch unlinked UNCLAIMED name-stubs for this team's projects
    const teamProjects = await prisma.project.findMany({
      where: { workspaceId: teamId },
      select: { id: true },
    });
    const projectIds = teamProjects.map((p) => p.id);

    const unlinkedNames = await prisma.user.findMany({
      where: {
        email: null,
        linkedToId: null,
        projectMemberships: { some: { projectId: { in: projectIds } } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    res.json({
      members: members.map((m) => ({
        id: m.id,
        teamRole: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
      unlinkedNames,
    });
  } catch (e) { next(e); }
});

// ── POST /teams/:teamId/members — add a member by email ──────────────────────
teamsRouter.post(
  '/:teamId/members',
  requireTeamAdmin,
  validate(z.object({
    email: z.string().email().refine((e) => e.endsWith(GETI_DOMAIN), {
      message: 'Only @geti.education emails are allowed',
    }),
    teamRole: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId } = req.params as { teamId: string };
      const { email, teamRole } = req.body as { email: string; teamRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' };

      const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

      // Only super admin can assign OWNER/ADMIN roles (team leads can only add MEMBER/VIEWER)
      if (!isSuperAdmin && (teamRole === 'OWNER' || teamRole === 'ADMIN')) {
        throw new ForbiddenError('Only Super Admin can assign lead roles');
      }

      const team = await prisma.workspace.findUnique({ where: { id: teamId } });
      if (!team) throw new NotFoundError('Team');

      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        if (!env.DEFAULT_MEMBER_PASSWORD) {
          throw new AppError('INTERNAL', 'DEFAULT_MEMBER_PASSWORD is not configured', 500);
        }
        const ph = await hashPassword(env.DEFAULT_MEMBER_PASSWORD);
        const localPart = email.split('@')[0] ?? email;
        const name = localPart
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        user = await prisma.user.create({
          data: { email, name, passwordHash: ph, role: 'MEMBER', status: 'ACTIVE', mustChangePassword: true },
        });
      }

      const existing = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: user.id, workspaceId: teamId } },
      });
      if (existing) throw new ConflictError('User is already a member of this team');

      const membership = await prisma.workspaceMember.create({
        data: { userId: user.id, workspaceId: teamId, role: teamRole },
        include: { user: { select: { id: true, email: true, name: true, status: true, mustChangePassword: true } } },
      });

      res.status(201).json({
        id: membership.id,
        teamRole: membership.role,
        user: membership.user,
      });
    } catch (e) { next(e); }
  },
);

// ── DELETE /teams/:teamId/members/:userId — remove a member ──────────────────
teamsRouter.delete('/:teamId/members/:userId', requireTeamAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, userId } = req.params as { teamId: string; userId: string };
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new NotFoundError('User');
    if (target.role === 'SUPER_ADMIN') throw new ForbiddenError('Cannot remove a Super Admin from a team');

    // Team lead cannot remove other leads/admins — only super admin can
    if (!isSuperAdmin) {
      const targetMembership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: teamId } },
      });
      if (targetMembership && (targetMembership.role === 'OWNER' || targetMembership.role === 'ADMIN')) {
        throw new ForbiddenError('Only Super Admin can remove team leads');
      }
    }

    await prisma.workspaceMember.deleteMany({
      where: { userId, workspaceId: teamId },
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── PATCH /teams/:teamId/members/:userId/role — change member role ────────────
teamsRouter.patch(
  '/:teamId/members/:userId/role',
  requireTeamAdmin,
  validate(z.object({
    teamRole: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teamId, userId } = req.params as { teamId: string; userId: string };
      const { teamRole } = req.body as { teamRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' };
      const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

      // Only super admin can assign or revoke OWNER/ADMIN
      if (!isSuperAdmin && (teamRole === 'OWNER' || teamRole === 'ADMIN')) {
        throw new ForbiddenError('Only Super Admin can assign lead roles');
      }

      const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!target) throw new NotFoundError('User');
      if (target.role === 'SUPER_ADMIN') throw new ForbiddenError('Cannot change role of a Super Admin');

      const updated = await prisma.workspaceMember.update({
        where: { userId_workspaceId: { userId, workspaceId: teamId } },
        data: { role: teamRole },
        select: { id: true, role: true, userId: true },
      });

      res.json({ id: updated.id, userId: updated.userId, teamRole: updated.role });
    } catch (e) { next(e); }
  },
);

// ── DELETE /teams/:teamId — archive a team (super admin only) ─────────────────
teamsRouter.delete('/:teamId', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.params as { teamId: string };
    await prisma.workspace.update({
      where: { id: teamId },
      data: { archivedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
