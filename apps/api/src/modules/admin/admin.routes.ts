import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { requireAuth, requireSuperAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { env } from '../../lib/env';
import { NotFoundError, AppError } from '../../lib/errors';
import type { Prisma } from '@sprintflow/db';
import type { Request, Response, NextFunction } from 'express';

export const adminRouter: IRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);

const GETI_DOMAIN = '@geti.education';

const userSelect = {
  id: true, email: true, name: true, role: true, status: true,
  mustChangePassword: true, createdAt: true,
  projectMemberships: { select: { id: true, projectId: true, role: true } },
  linkedNames: { select: { id: true, name: true } },
} as const;

// ── GET /admin/users ──────────────────────────────────────────────────────────
// Returns only @geti.education email users + unlinked UNCLAIMED name-stubs
adminRouter.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.query['workspaceId'] as string | undefined;

    const baseWhere = workspaceId
      ? { memberships: { some: { workspaceId } } }
      : {};

    const emailUsers = await prisma.user.findMany({
      where: {
        ...baseWhere,
        email: { endsWith: GETI_DOMAIN },
      },
      select: userSelect,
      orderBy: [{ status: 'asc' }, { email: 'asc' }],
    });

    // UNCLAIMED name-stubs with no email and not yet linked to anyone
    const unlinkedNames = await prisma.user.findMany({
      where: {
        ...baseWhere,
        email: null,
        linkedToId: null,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    res.json({ data: emailUsers, unlinkedNames });
  } catch (e) { next(e); }
});

// ── POST /admin/users — create a placeholder user with just an email ──────────
adminRouter.post(
  '/users',
  validate(z.object({
    email: z.string().email().refine((e) => e.endsWith(GETI_DOMAIN), {
      message: 'Only @geti.education emails are allowed',
    }),
    workspaceId: z.string(),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, workspaceId } = req.body as { email: string; workspaceId: string };

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new AppError('CONFLICT', 'This email already exists in the system', 409);

      if (!env.DEFAULT_MEMBER_PASSWORD) {
        throw new AppError('INTERNAL', 'DEFAULT_MEMBER_PASSWORD is not configured', 500);
      }

      const passwordHash = await hashPassword(env.DEFAULT_MEMBER_PASSWORD);
      // Derive a display name from the email local part
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
          status: 'UNCLAIMED',
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
adminRouter.post(
  '/users/:userId/link',
  validate(z.object({ nameUserId: z.string() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const { nameUserId } = req.body as { nameUserId: string };

      const nameUser = await prisma.user.findUnique({ where: { id: nameUserId } });
      if (!nameUser) throw new NotFoundError('Name user');
      if (nameUser.email !== null) {
        throw new AppError('BAD_REQUEST', 'Can only link UNCLAIMED name-stubs (no email)', 400);
      }

      await prisma.user.update({
        where: { id: nameUserId },
        data: { linkedToId: userId },
      });

      res.json({ ok: true });
    } catch (e) { next(e); }
  },
);

// ── DELETE /admin/users/:userId/unlink/:nameId — remove a name link ───────────
adminRouter.delete(
  '/users/:userId/unlink/:nameId',
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
  validate(z.object({
    projectId: z.string(),
    role: z.enum(['LEAD', 'MEMBER', 'VIEWER']),
  })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const { projectId, role } = req.body as { projectId: string; role: 'LEAD' | 'MEMBER' | 'VIEWER' };

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundError('User');
      if (user.role === 'SUPER_ADMIN') {
        throw new AppError('BAD_REQUEST', 'Super admins do not have project roles', 400);
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundError('Project');

      const membership = await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        update: { role },
        create: { projectId, userId, role, hoursPerDay: 6 },
      });

      const wsMembership = await prisma.workspaceMember.findFirst({
        where: { userId },
        select: { workspaceId: true },
      });
      if (wsMembership) {
        await prisma.activityLog.create({
          data: {
            workspaceId: wsMembership.workspaceId,
            actorId: req.user!.id,
            action: 'USER_ROLE_CHANGED',
            entityType: 'user',
            entityId: userId,
            diff: { projectId, role } as Prisma.InputJsonValue,
          },
        });
      }

      res.json({ id: membership.id, userId, projectId, role });
    } catch (e) { next(e); }
  },
);

// ── PATCH /admin/users/:userId/status — activate or deactivate ───────────────
adminRouter.patch(
  '/users/:userId/status',
  validate(z.object({ status: z.enum(['ACTIVE', 'DEACTIVATED']) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      const { status } = req.body as { status: 'ACTIVE' | 'DEACTIVATED' };

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) throw new NotFoundError('User');
      if (target.role === 'SUPER_ADMIN') {
        throw new AppError('BAD_REQUEST', 'Cannot deactivate a Super Admin', 400);
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
            workspaceId: wsMembership.workspaceId,
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
adminRouter.post('/users/:userId/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params as { userId: string };

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundError('User');
    if (target.role === 'SUPER_ADMIN') {
      throw new AppError('BAD_REQUEST', 'Cannot reset a Super Admin password via admin API', 400);
    }
    if (!env.DEFAULT_MEMBER_PASSWORD) {
      throw new AppError('INTERNAL', 'DEFAULT_MEMBER_PASSWORD is not configured', 500);
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
          workspaceId: wsMembership.workspaceId,
          actorId: req.user!.id,
          action: 'PASSWORD_RESET',
          entityType: 'user',
          entityId: userId,
        },
      });
    }

    res.json({ message: 'Password reset to default. User must change on next login.' });
  } catch (e) { next(e); }
});
