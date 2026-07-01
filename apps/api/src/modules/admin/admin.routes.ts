import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth, requireSuperAdmin, requireTeamAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { env } from '../../lib/env';
import { NotFoundError, AppError, ConflictError, ForbiddenError } from '../../lib/errors';
import type { Prisma } from '@sprintflow/db';
import type { Request, Response, NextFunction } from 'express';

export const adminRouter: IRouter = Router();
adminRouter.use(requireAuth);

const GETI_DOMAIN = '@geti.education';

const userSelect = {
  id: true, email: true, name: true, role: true, status: true,
  mustChangePassword: true, createdAt: true,
  projectMemberships: { select: { id: true, projectId: true, role: true } },
  linkedNames: { select: { id: true, name: true } },
} as const;

// Helper: resolve the workspaceId for team-scoped requests.
// If the caller is a super admin, workspaceId may come from query/body but is optional (global view).
// If the caller is a team admin, workspaceId is required.
async function resolveWorkspaceId(req: Request): Promise<string | undefined> {
  return (req.query['workspaceId'] as string | undefined) ?? (req.body as { workspaceId?: string })?.workspaceId;
}

// Helper: assert the caller can manage users in the given workspace.
// Super admins can always proceed; team admins must be OWNER/ADMIN of that workspace.
async function assertCanManage(req: Request, workspaceId: string): Promise<void> {
  if (req.user!.role === 'SUPER_ADMIN') return;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: req.user!.id, workspaceId } },
  });
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
    throw new ForbiddenError('Requires team lead (Admin/Owner) role for this team');
  }
}

// ── GET /admin/users ──────────────────────────────────────────────────────────
// Super admin: all @geti.education users (optionally filtered by workspaceId).
// Team admin: users of their team's workspace (workspaceId required).
adminRouter.get('/users', requireTeamAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = await resolveWorkspaceId(req);
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    if (!isSuperAdmin && !workspaceId) {
      return next(new AppError('BAD_REQUEST', 'workspaceId is required for team admins', 400));
    }

    if (workspaceId) {
      await assertCanManage(req, workspaceId);
    }

    const baseWhere = workspaceId
      ? { memberships: { some: { workspaceId } } }
      : {};

    const emailUsers = await prisma.user.findMany({
      where: { ...baseWhere, email: { endsWith: GETI_DOMAIN } },
      select: userSelect,
      orderBy: [{ status: 'asc' }, { email: 'asc' }],
    });

    // UNCLAIMED name-stubs: if scoped to a workspace, only those in that workspace's projects
    let unlinkedNames;
    if (workspaceId) {
      const projectIds = (await prisma.project.findMany({ where: { workspaceId }, select: { id: true } })).map((p) => p.id);
      unlinkedNames = await prisma.user.findMany({
        where: { email: null, linkedToId: null, projectMemberships: { some: { projectId: { in: projectIds } } } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    } else {
      unlinkedNames = await prisma.user.findMany({
        where: { email: null, linkedToId: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
    }

    res.json({ data: emailUsers, unlinkedNames });
  } catch (e) { next(e); }
});

// ── POST /admin/users — create a placeholder user with an email ───────────────
adminRouter.post(
  '/users',
  requireTeamAdmin,
  validate(z.object({
    email: z.string().email().refine((e) => e.endsWith(GETI_DOMAIN), {
      message: 'Only @geti.education emails are allowed',
    }),
    workspaceId: z.string(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, workspaceId } = req.body as { email: string; workspaceId: string };
      await assertCanManage(req, workspaceId);

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // If user exists but is not in this workspace, add them
        const alreadyMember = await prisma.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId: existing.id, workspaceId } },
        });
        if (alreadyMember) throw new ConflictError('This email already exists in the system');
        await prisma.workspaceMember.create({
          data: { userId: existing.id, workspaceId, role: 'MEMBER' },
        });
        const updated = await prisma.user.findUnique({ where: { id: existing.id }, select: userSelect });
        return res.status(201).json(updated);
      }

      if (!env.DEFAULT_MEMBER_PASSWORD) {
        throw new AppError('INTERNAL', 'DEFAULT_MEMBER_PASSWORD is not configured', 500);
      }

      const passwordHash = await hashPassword(env.DEFAULT_MEMBER_PASSWORD);
      const localPart = email.split('@')[0] ?? email;
      const name = localPart
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'MEMBER',
          status: 'ACTIVE',
          mustChangePassword: true,
          memberships: { create: { workspaceId, role: 'MEMBER' } },
        },
        select: userSelect,
      });

      res.status(201).json(user);
    } catch (e) { next(e); }
  },
);

// ── POST /admin/users/:userId/link — attach an UNCLAIMED name-stub ────────────
// Re-points the stub's ProjectMember rows to the real user (Phase 6 logic).
adminRouter.post(
  '/users/:userId/link',
  requireTeamAdmin,
  validate(z.object({ nameUserId: z.string(), workspaceId: z.string().optional() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const { nameUserId, workspaceId } = req.body as { nameUserId: string; workspaceId?: string };

      if (workspaceId) await assertCanManage(req, workspaceId);

      const realUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!realUser) throw new NotFoundError('User');

      const nameUser = await prisma.user.findUnique({
        where: { id: nameUserId },
        include: { projectMemberships: { include: { assignments: true } } },
      });
      if (!nameUser) throw new NotFoundError('Name user');
      if (nameUser.email !== null) {
        throw new AppError('BAD_REQUEST', 'Can only link UNCLAIMED name-stubs (no email)', 400);
      }

      // Phase 6: re-point ProjectMember/assignments to the real user within a transaction
      await prisma.$transaction(async (tx) => {
        for (const stubPm of nameUser.projectMemberships) {
          // Check if real user already has a ProjectMember row for this project
          const existingPm = await tx.projectMember.findUnique({
            where: { projectId_userId: { projectId: stubPm.projectId, userId: realUser.id } },
          });

          if (existingPm) {
            // Merge: re-parent stub's assignments to the existing ProjectMember
            for (const assignment of stubPm.assignments) {
              const existingAssignment = await tx.taskAssignment.findUnique({
                where: { taskId_projectMemberId: { taskId: assignment.taskId, projectMemberId: existingPm.id } },
              });
              if (existingAssignment) {
                // Already has an assignment for this task — keep existing, delete duplicate
                await tx.taskAssignment.delete({ where: { id: assignment.id } });
              } else {
                await tx.taskAssignment.update({
                  where: { id: assignment.id },
                  data: { projectMemberId: existingPm.id },
                });
              }
            }
            // Delete the now-empty stub ProjectMember
            await tx.projectMember.delete({ where: { id: stubPm.id } });
          } else {
            // Move: reassign the stub's ProjectMember to the real user
            await tx.projectMember.update({
              where: { id: stubPm.id },
              data: { userId: realUser.id },
            });
          }
        }

        // Mark the stub as linked (keeps it as an alias)
        await tx.user.update({
          where: { id: nameUserId },
          data: { linkedToId: userId },
        });

        // Log the merge
        if (workspaceId) {
          await tx.activityLog.create({
            data: {
              workspaceId,
              actorId: req.user!.id,
              action: 'USER_ROLE_CHANGED',
              entityType: 'user',
              entityId: userId,
              diff: { linked: nameUserId, nameUser: nameUser.name } as Prisma.InputJsonValue,
            },
          });
        }
      });

      res.json({ ok: true });
    } catch (e) { next(e); }
  },
);

// ── DELETE /admin/users/:userId/unlink/:nameId — remove a name link ───────────
adminRouter.delete(
  '/users/:userId/unlink/:nameId',
  requireTeamAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nameId } = req.params as { userId: string; nameId: string };

      const nameUser = await prisma.user.findUnique({ where: { id: nameId } });
      if (!nameUser) throw new NotFoundError('Name user');

      await prisma.user.update({
        where: { id: nameId },
        data: { linkedToId: null },
      });

      res.json({ ok: true });
    } catch (e) { next(e); }
  },
);

// ── PATCH /admin/users/:userId/lead — promote/demote project lead ─────────────
adminRouter.patch(
  '/users/:userId/lead',
  requireTeamAdmin,
  validate(z.object({
    projectId: z.string(),
    role: z.enum(['LEAD', 'MEMBER', 'VIEWER']),
    workspaceId: z.string().optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const { projectId, role, workspaceId } = req.body as {
        projectId: string; role: 'LEAD' | 'MEMBER' | 'VIEWER'; workspaceId?: string;
      };

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError('User');
      if (user.role === 'SUPER_ADMIN') {
        throw new AppError('BAD_REQUEST', 'Super admins do not have project roles', 400);
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundError('Project');

      // Verify caller can manage this project's workspace
      await assertCanManage(req, workspaceId ?? project.workspaceId);

      const membership = await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        update: { role },
        create: { projectId, userId, role, hoursPerDay: 6 },
      });

      await prisma.activityLog.create({
        data: {
          workspaceId: project.workspaceId,
          actorId: req.user!.id,
          action: 'USER_ROLE_CHANGED',
          entityType: 'user',
          entityId: userId,
          diff: { projectId, role } as Prisma.InputJsonValue,
        },
      });

      res.json({ id: membership.id, userId, projectId, role });
    } catch (e) { next(e); }
  },
);

// ── PATCH /admin/users/:userId/status — activate or deactivate ───────────────
adminRouter.patch(
  '/users/:userId/status',
  requireTeamAdmin,
  validate(z.object({
    status: z.enum(['ACTIVE', 'DEACTIVATED']),
    workspaceId: z.string().optional(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const { status, workspaceId } = req.body as { status: 'ACTIVE' | 'DEACTIVATED'; workspaceId?: string };

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError('User');
      if (target.role === 'SUPER_ADMIN') {
        throw new AppError('BAD_REQUEST', 'Cannot deactivate a Super Admin', 400);
      }

      // For team admins, verify the target is a member of their team
      if (req.user!.role !== 'SUPER_ADMIN') {
        const wsId = workspaceId;
        if (!wsId) throw new AppError('BAD_REQUEST', 'workspaceId required', 400);
        await assertCanManage(req, wsId);
        const targetMembership = await prisma.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId, workspaceId: wsId } },
        });
        if (!targetMembership) throw new ForbiddenError('User is not a member of your team');
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { status },
        select: { id: true, email: true, name: true, role: true, status: true },
      });

      const wsMembership = await prisma.workspaceMember.findFirst({
        where: { userId },
        select: { workspaceId: true },
      });
      if (wsMembership) {
        await prisma.activityLog.create({
          data: {
            workspaceId: workspaceId ?? wsMembership.workspaceId,
            actorId: req.user!.id,
            action: 'USER_DEACTIVATED',
            entityType: 'user',
            entityId: userId,
            diff: { status } as Prisma.InputJsonValue,
          },
        });
      }

      res.json(updated);
    } catch (e) { next(e); }
  },
);

// ── POST /admin/users/:userId/reset-password ──────────────────────────────────
adminRouter.post(
  '/users/:userId/reset-password',
  requireTeamAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const workspaceId = await resolveWorkspaceId(req);

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError('User');
      if (target.role === 'SUPER_ADMIN') {
        throw new AppError('BAD_REQUEST', 'Cannot reset a Super Admin password via admin API', 400);
      }
      if (!env.DEFAULT_MEMBER_PASSWORD) {
        throw new AppError('INTERNAL', 'DEFAULT_MEMBER_PASSWORD is not configured', 500);
      }

      // For team admins, verify the target is a member of their team
      if (req.user!.role !== 'SUPER_ADMIN') {
        if (!workspaceId) throw new AppError('BAD_REQUEST', 'workspaceId required', 400);
        await assertCanManage(req, workspaceId);
        const targetMembership = await prisma.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId, workspaceId } },
        });
        if (!targetMembership) throw new ForbiddenError('User is not a member of your team');
      }

      const passwordHash = await hashPassword(env.DEFAULT_MEMBER_PASSWORD);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { passwordHash, mustChangePassword: true },
        }),
        prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);

      const wsMembership = await prisma.workspaceMember.findFirst({
        where: { userId },
        select: { workspaceId: true },
      });
      if (wsMembership) {
        await prisma.activityLog.create({
          data: {
            workspaceId: workspaceId ?? wsMembership.workspaceId,
            actorId: req.user!.id,
            action: 'PASSWORD_RESET',
            entityType: 'user',
            entityId: userId,
          },
        });
      }

      res.json({ message: 'Password reset to default. User must change on next login.' });
    } catch (e) { next(e); }
  },
);

// ── GET /admin/teams — list all teams with member counts (super admin only) ───
adminRouter.get('/teams', requireSuperAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const teams = await prisma.workspace.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
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
      leads: t.members
        .filter((m) => m.role === 'OWNER' || m.role === 'ADMIN')
        .map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role })),
    })));
  } catch (e) { next(e); }
});
