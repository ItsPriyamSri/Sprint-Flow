import type { Request, Response, NextFunction } from 'express';
import * as usersService from './users.service';

export async function invite(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params as { workspaceId: string };
    const { email, name, role } = req.body as { email: string; name: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' };
    const result = await usersService.inviteUser(workspaceId, { email, name, role });
    // In production: send invite email. For MVP: return the token in response.
    res.status(201).json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        status: result.user.status,
      },
      inviteToken: result.inviteToken,
    });
  } catch (e) {
    next(e);
  }
}

export async function claimAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, password } = req.body as { token: string; password: string };
    const user = await usersService.claimAccount(token, password);
    res.json({ id: user.id, email: user.email, name: user.name, status: user.status });
  } catch (e) {
    next(e);
  }
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params as { workspaceId: string };
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;
    const users = await usersService.listUsers(workspaceId, q);
    res.json({ data: users });
  } catch (e) {
    next(e);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params as { userId: string };
    const user = await usersService.getUser(userId);
    res.json(user);
  } catch (e) {
    next(e);
  }
}
