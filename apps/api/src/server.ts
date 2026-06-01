import { createApp } from './app';
import { env } from './lib/env';
import { prisma } from './lib/prisma';

// Prevent accidentally deploying dev secrets to production.
if (env.NODE_ENV === 'production') {
  const WEAK = ['change-me', 'test-', 'dev-', 'secret'];
  for (const [name, val] of [
    ['JWT_ACCESS_SECRET',  env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
  ] as [string, string][]) {
    if (val.length < 32 || WEAK.some((w) => val.toLowerCase().includes(w))) {
      console.error(`FATAL: ${name} is too weak or uses a dev placeholder. Set a strong random secret ≥32 chars.`);
      process.exit(1);
    }
  }
}

const app = createApp();

app.listen(env.API_PORT, () => {
  console.log(`🚀 API running on http://localhost:${env.API_PORT}`);
  console.log(`   Health: http://localhost:${env.API_PORT}/api/v1/health`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
