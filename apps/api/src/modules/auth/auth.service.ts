import { prisma } from '../../lib/prisma';
import { verifyPassword, hashPassword } from '../../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { UnauthorizedError, NotFoundError } from '../../lib/errors';
import { env } from '../../lib/env';
import { randomUUID } from 'crypto';

const REFRESH_TOKEN_TTL_DAYS = 7;

function refreshExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return d;
}

async function buildTokenPair(userId: string, role: string) {
  const tokenId = randomUUID();
  const refreshJwt = signRefreshToken(userId, tokenId);

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId,
      token: refreshJwt,
      expiresAt: refreshExpiresAt(),
    },
  });

  const accessToken = signAccessToken({ sub: userId, role });
  return { accessToken, refreshToken: refreshJwt };
}

// ─── JIT provisioning ─────────────────────────────────────────────────────────

function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(' ');
}

async function jitProvision(email: string, password: string) {
  if (!env.ALLOWED_EMAIL_DOMAINS || !env.DEFAULT_MEMBER_PASSWORD) return null;

  const domain = email.split('@')[1]?.toLowerCase();
  const allowed = env.ALLOWED_EMAIL_DOMAINS
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (!domain || !allowed.includes(domain)) return null;

  // Super admin emails cannot JIT-provision with the default password
  const superAdminEmails = env.SUPER_ADMIN_EMAILS
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (superAdminEmails.includes(email.toLowerCase())) return null;

  // JIT only triggers when the user supplies the default password
  if (password !== env.DEFAULT_MEMBER_PASSWORD) return null;

  // Resolve workspace to join
  let workspaceId: string | null = null;
  if (env.DEFAULT_WORKSPACE_SLUG) {
    const ws = await prisma.workspace.findUnique({ where: { slug: env.DEFAULT_WORKSPACE_SLUG } });
    workspaceId = ws?.id ?? null;
  }
  if (!workspaceId) {
    const ws = await prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
    workspaceId = ws?.id ?? null;
  }
  if (!workspaceId) return null;

  const passwordHash = await hashPassword(env.DEFAULT_MEMBER_PASSWORD);
  const name = deriveNameFromEmail(email);
  const wsId = workspaceId;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
        status: 'ACTIVE',
        role: 'MEMBER',
        mustChangePassword: true,
      },
    });

    await tx.workspaceMember.create({
      data: { userId: user.id, workspaceId: wsId, role: 'MEMBER' },
    });

    if (env.DEFAULT_PROJECT_ID) {
      const project = await tx.project.findUnique({ where: { id: env.DEFAULT_PROJECT_ID } });
      if (project && project.workspaceId === wsId) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: env.DEFAULT_PROJECT_ID, userId: user.id } },
          update: {},
          create: {
            projectId: env.DEFAULT_PROJECT_ID,
            userId: user.id,
            role: 'MEMBER',
            hoursPerDay: 6,
          },
        });
      }
    }

    await tx.activityLog.create({
      data: {
        workspaceId: wsId,
        actorId: user.id,
        action: 'USER_PROVISIONED',
        entityType: 'user',
        entityId: user.id,
      },
    });

    return user;
  });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // JIT provisioning for allowed domains
    const provisioned = await jitProvision(email, password);
    if (!provisioned) throw new UnauthorizedError('Invalid credentials');
    user = provisioned;
  }

  if (!user.passwordHash) throw new UnauthorizedError('Invalid credentials');
  if (user.status !== 'ACTIVE') throw new UnauthorizedError('Account not active');

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const tokens = await buildTokenPair(user.id, user.role);
  return { tokens, user };
}

export async function refresh(refreshJwt: string) {
  const payload = verifyRefreshToken(refreshJwt);
  if (!payload) throw new UnauthorizedError('Invalid refresh token');

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token expired or revoked');
  }

  // Rotate: revoke old, issue new pair
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError('Account not active');

  return buildTokenPair(user.id, user.role);
}

export async function logout(refreshJwt: string) {
  const payload = verifyRefreshToken(refreshJwt);
  if (!payload) return; // already invalid — silent

  await prisma.refreshToken.updateMany({
    where: { id: payload.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: { workspace: { include: { boards: { select: { id: true, name: true }, take: 1 } } } },
        orderBy: { joinedAt: 'asc' },
      },
      projectMemberships: {
        select: { id: true, projectId: true, role: true, hoursPerDay: true },
      },
    },
  });
  if (!user) throw new NotFoundError('User');
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials');

  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) throw new UnauthorizedError('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
