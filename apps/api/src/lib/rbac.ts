import { prisma } from './prisma';
import { ForbiddenError } from './errors';

const WORKSPACE_ROLE_RANK: Record<string, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

export function hasWorkspaceRole(memberRole: string, minRole: string): boolean {
  return (WORKSPACE_ROLE_RANK[memberRole] ?? -1) >= (WORKSPACE_ROLE_RANK[minRole] ?? 999);
}

/** Verifies the user is a workspace member with at least minRole. */
export async function assertWorkspaceMember(
  userId: string,
  workspaceId: string,
  minRole: 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER' = 'VIEWER',
) {
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) throw new ForbiddenError('Not a workspace member');
  if (!hasWorkspaceRole(membership.role, minRole)) {
    throw new ForbiddenError(`Requires ${minRole} role or higher`);
  }
  return membership;
}

// Returns the user's single workspace for MVP (one workspace per installation)
export async function getDefaultWorkspace(userId: string) {
  return prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: { include: { boards: { take: 1 } } } },
    orderBy: { joinedAt: 'asc' },
  });
}
