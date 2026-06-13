import { Router, type IRouter } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { LoginSchema } from '@sprintflow/shared';
import { z } from 'zod';
import * as ctrl from './auth.controller';

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts — try again in a minute' } },
});

export const authRouter: IRouter = Router();

authRouter.post('/login', loginLimiter, validate(LoginSchema), ctrl.login);
authRouter.post('/refresh', ctrl.refresh);
authRouter.post('/logout', ctrl.logout);
authRouter.get('/me', requireAuth, ctrl.me);
authRouter.post(
  '/me/password',
  requireAuth,
  validate(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }),
  ),
  ctrl.changePassword,
);
