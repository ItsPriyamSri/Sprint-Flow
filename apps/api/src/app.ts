import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/error';
import { healthRouter }     from './modules/health/health.routes';
import { authRouter }       from './modules/auth/auth.routes';
import { usersRouter }      from './modules/users/users.routes';
import { importRouter }     from './modules/import/import.routes';
import { workspacesRouter } from './modules/workspaces/workspaces.routes';
import { boardsRouter }     from './modules/boards/boards.routes';
import { tasksRouter }      from './modules/tasks/tasks.routes';
import { sprintsRouter }    from './modules/sprints/sprints.routes';
import { activityRouter }   from './modules/activity/activity.routes';
import { projectsRouter }   from './modules/projects/projects.routes';
import { adminRouter }      from './modules/admin/admin.routes';
import { teamsRouter }      from './modules/teams/teams.routes';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);

  // Structured request logging — JSON in production, pretty in dev
  app.use(pinoHttp({ logger }));

  // Security headers — disable CSP since this is a JSON API (not serving HTML)
  app.use(
    helmet({
      contentSecurityPolicy:    false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS: multi-origin list, required in production (throws at startup if unset via env.ts)
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false }));

  app.use('/api/v1/health',     healthRouter);
  app.use('/api/v1/auth',       authRouter);
  app.use('/api/v1/users',      usersRouter);
  app.use('/api/v1/imports',    importRouter);
  app.use('/api/v1/workspaces', workspacesRouter);
  app.use('/api/v1/boards',     boardsRouter);
  app.use('/api/v1/tasks',      tasksRouter);
  app.use('/api/v1/sprints',    sprintsRouter);
  app.use('/api/v1/activity',   activityRouter);
  app.use('/api/v1/projects',   projectsRouter);
  app.use('/api/v1/admin',      adminRouter);
  app.use('/api/v1/teams',      teamsRouter);

  app.use(errorHandler);
  return app;
}
