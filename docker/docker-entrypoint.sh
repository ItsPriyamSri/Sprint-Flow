#!/bin/sh
set -e

echo "🔄  Running Prisma migrations..."
pnpm --filter @sprintflow/db exec prisma migrate deploy
echo "✅  Migrations applied"

echo "🚀  Starting API server..."
exec node /app/apps/api/dist/server.js
