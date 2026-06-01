import { prisma } from '../../lib/prisma';
import { verifyPassword, hashPassword } from '../../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { UnauthorizedError, NotFoundError } from '../../lib/errors';
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

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid credentials');
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
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
