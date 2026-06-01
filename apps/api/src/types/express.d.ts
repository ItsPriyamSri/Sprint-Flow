import 'express';

export interface AuthUser {
  id: string;
  role: string; // GlobalRole
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
