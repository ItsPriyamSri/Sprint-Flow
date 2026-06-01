import type { Request, Response, NextFunction } from 'express';
import { assertWorkspaceMember } from '../lib/rbac';
import { AppError, UnauthorizedError } from '../lib/errors';

export function workspaceIdFromRequest(req: Request): string {
  const raw = req.query['workspaceId'] ?? req.body?.workspaceId ?? req.headers['x-workspace-id'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== 'string') {
    throw new AppError('BAD_REQUEST', 'workspaceId required', 400);
  }
  return id;
}

export function requireWorkspaceAccess(minRole: 'VIEWER' | 'MEMBER' = 'VIEWER') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(new UnauthorizedError());
      const workspaceId = workspaceIdFromRequest(req);
      await assertWorkspaceMember(req.user.id, workspaceId, minRole);
      next();
    } catch (e) {
      next(e);
    }
  };
}
