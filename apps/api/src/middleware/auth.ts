import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { getWorkspaceMembership, hasWorkspaceRole } from '../lib/rbac';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing access token'));
  }
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return next(new UnauthorizedError('Invalid or expired access token'));
  }
  req.user = { id: payload.sub, role: payload.role };
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role !== 'SUPER_ADMIN') return next(new ForbiddenError('Requires Super Admin'));
  next();
}

/** @deprecated Use requireSuperAdmin — kept for any remaining call sites */
export function requireGlobalRole(_role: 'ADMIN') {
  return requireSuperAdmin;
}

export function requireWorkspaceRole(minRole: 'VIEWER' | 'MEMBER' | 'ADMIN' | 'OWNER') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    const workspaceId = req.params['workspaceId'] ?? req.body?.workspaceId;
    if (!workspaceId) return next(new ForbiddenError('workspaceId required'));

    try {
      const membership = await getWorkspaceMembership(req.user.id, workspaceId);
      if (!membership) return next(new ForbiddenError('Not a workspace member'));
      if (!hasWorkspaceRole(membership.role, minRole)) {
        return next(new ForbiddenError(`Requires ${minRole} role`));
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}
