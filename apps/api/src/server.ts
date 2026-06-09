import { createApp } from './app';
import { env } from './lib/env';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';

// Prevent accidentally deploying dev secrets to production.
if (env.NODE_ENV === 'production') {
  const WEAK = ['change-me', 'test-', 'dev-', 'secret'];
  for (const [name, val] of [
    ['JWT_ACCESS_SECRET',  env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
  ] as [string, string][]) {
    if (val.length < 32 || WEAK.some((w) => val.toLowerCase().includes(w))) {
      logger.fatal({ secret: name }, 'Weak or placeholder secret — refusing to start in production');
      process.exit(1);
    }
  }
}

const app = createApp();

const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'API server started');
});

// ECS deregisters the task from the ALB before sending SIGTERM.
// Stop accepting new connections, give in-flight requests ~10s to drain,
// then disconnect Prisma and exit cleanly.
const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received — draining connections');
  server.close(async () => {
    logger.info('HTTP server closed — disconnecting database');
    await prisma.$disconnect();
    process.exit(0);
  });

  // Safety net: force exit after 10s if drain hangs
  setTimeout(() => {
    logger.warn('Drain timeout exceeded — forcing exit');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
