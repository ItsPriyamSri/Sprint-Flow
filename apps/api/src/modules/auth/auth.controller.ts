import type { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'sf_refresh';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env['NODE_ENV'] === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d ms
  path: '/api/v1/auth',
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...COOKIE_OPTIONS, maxAge: 0 });
}

type SerializedUser = {
  id: string;
  email: string | null;
  name: string;
  role: string;
  status: string;
  createdAt: string;
};

function serializeUser(user: {
  id: string;
  email: string | null;
  name: string;
  role: string;
  status: string;
  createdAt: Date;
}): SerializedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

function serializeUserWithMemberships(user: Awaited<ReturnType<typeof authService.getMe>>) {
  return {
    ...serializeUser(user),
    memberships: user.memberships.map((m) => ({
      workspaceId: m.workspaceId,
      workspaceName: m.workspace.name,
      workspaceSlug: m.workspace.slug,
      role: m.role,
      boards: m.workspace.boards,
    })),
  };
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const { tokens, user } = await authService.login(email, password);
    const fullUser = await authService.getMe(user.id);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken, user: serializeUserWithMemberships(fullUser) });
  } catch (e) {
    next(e);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshJwt = req.cookies[REFRESH_COOKIE] as string | undefined;
    if (!refreshJwt) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token' } });
      return;
    }
    const tokens = await authService.refresh(refreshJwt);
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken });
  } catch (e) {
    next(e);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshJwt = req.cookies[REFRESH_COOKIE] as string | undefined;
    if (refreshJwt) await authService.logout(refreshJwt);
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user!.id);
    res.json(serializeUserWithMemberships(user));
  } catch (e) {
    next(e);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    await authService.changePassword(req.user!.id, currentPassword, newPassword);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}
