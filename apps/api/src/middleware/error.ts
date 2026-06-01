import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@sprintflow/db';
import { AppError } from '../lib/errors';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: err.flatten() },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'DUPLICATE',
          message: 'A record with this identifier already exists. If re-importing, try rolling back the previous import first.',
        },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(422).json({
        error: {
          code: 'INVALID_REFERENCE',
          message: 'Import could not link hours to a project member. Ensure owners in the sheet match project members (Nate, Iris, etc.).',
        },
      });
      return;
    }
  }

  console.error('[Unhandled]', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
