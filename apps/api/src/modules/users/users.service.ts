import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import { signInviteToken, verifyInviteToken } from '../../lib/jwt';
import { ConflictError, NotFoundError, UnauthorizedError, ForbiddenError } from '../../lib/errors';

export async function inviteUser(
  workspaceId: string,
  input: { email: string; name: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' },
) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // Re-invite if INVITED status
    if (existing.status !== 'INVITED' && existing.status !== 'UNCLAIMED') {
      throw new ConflictError(`User ${input.email} already exists`);
    }
    // Ensure they're a workspace member
    await prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: existing.id, workspaceId } },
      update: { role: input.role },
      create: { userId: existing.id, workspaceId, role: input.role },
    });
    const inviteToken = signInviteToken(existing.id);
    return { user: existing, inviteToken };
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      status: 'INVITED',
      memberships: {
        create: { workspaceId, role: input.role },
      },
    },
  });
  const inviteToken = signInviteToken(user.id);
  return { user, inviteToken };
}

export async function claimAccount(inviteToken: string, password: string) {
  const result = verifyInviteToken(inviteToken);
  if (!result) throw new UnauthorizedError('Invalid or expired invite token');

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user) throw new NotFoundError('User');
  if (user.status === 'ACTIVE') throw new ConflictError('Account already claimed');
  if (user.status !== 'INVITED' && user.status !== 'UNCLAIMED') {
    throw new ForbiddenError('Cannot claim this account');
  }

  const passwordHash = await hashPassword(password);
  return prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, status: 'ACTIVE' },
  });
}

export async function listUsers(workspaceId: string, query?: string) {
  return prisma.user.findMany({
    where: {
      memberships: { some: { workspaceId } },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
}

export async function getUser(requesterId: string, targetUserId: string, workspaceId: string) {
  const [requesterMembership, targetMembership] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: requesterId, workspaceId } },
    }),
    prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    }),
  ]);
  if (!requesterMembership) throw new ForbiddenError('Not a workspace member');
  if (!targetMembership) throw new NotFoundError('User');

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  });
  if (!user) throw new NotFoundError('User');
  return user;
}
