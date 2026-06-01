import jwt from 'jsonwebtoken';
import { env } from './env';

export interface AccessTokenPayload {
  sub: string; // userId
  role: string; // GlobalRole
}

interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // RefreshToken.id — used to look up and revoke
}

interface InviteTokenPayload {
  sub: string; // userId
  type: 'invite';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign({ sub: userId, jti: tokenId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

export function signInviteToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'invite' } satisfies InviteTokenPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyInviteToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as InviteTokenPayload;
    if (payload.type !== 'invite') return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}
