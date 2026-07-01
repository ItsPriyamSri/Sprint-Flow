import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { getWorkspaceMembership, hasWorkspaceRole } from '../lib/rbac';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

// ── Team admin guard ──────────────────────────────────────────────────────────
// Allows SUPER_ADMIN (always), or workspace OWNER/ADMIN for the target workspace.
// Reads workspaceId from req.params.teamId || req.params.workspaceId || req.body.workspaceId || req.query.workspaceId.
export function requireTeamAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.role === 'SUPER_ADMIN') return next();

  const workspaceId =
    (req.params as Record<string, string>)['teamId'] ??
    (req.params as Record<string, string>)['workspaceId'] ??
    (req.body as Record<string, unknown> | undefined)?.['workspaceId'] ??
    (req.query as Record<string, string>)['workspaceId'];

  if (!workspaceId) return next(new ForbiddenError('Team ID required'));

  getWorkspaceMembership(req.user.id, workspaceId as string)
    .then((membership) => {
      if (!membership) return next(new ForbiddenError('Not a member of this team'));
      if (!hasWorkspaceRole(membership.role, 'ADMIN')) {
        return next(new ForbiddenError('Requires team lead (Admin/Owner) role'));
      }
      next();
    })
    .catch(next);
}

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
