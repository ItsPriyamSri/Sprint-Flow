import { Router, type IRouter } from 'express';
import { validate } from '../../middleware/validate';
import { requireAuth, requireGlobalRole, requireWorkspaceRole } from '../../middleware/auth';
import { InviteUserSchema, ClaimAccountSchema } from '@sprintflow/shared';
import { z } from 'zod';
import * as ctrl from './users.controller';

export const usersRouter: IRouter = Router();

// Claim an invited / unclaimed account (public — authenticated via invite token in body)
usersRouter.post(
  '/claim',
  validate(z.object({ token: z.string(), password: ClaimAccountSchema.shape.password })),
  ctrl.claimAccount,
);

// All routes below require authentication
usersRouter.use(requireAuth);

// List users in a workspace (for assignee pickers)
usersRouter.get('/workspace/:workspaceId', requireWorkspaceRole('VIEWER'), ctrl.listUsers);

// Get a single user
usersRouter.get('/:userId', ctrl.getUser);

// Invite a user to a workspace (admin only)
usersRouter.post(
  '/workspace/:workspaceId/invite',
  requireWorkspaceRole('ADMIN'),
  validate(InviteUserSchema),
  ctrl.invite,
);
