# AWS Deployment Readiness Plan

## Current State

SprintFlow is a pnpm monorepo with:
- **API**: Express.js + TypeScript on Node 22, port 3001
- **Web**: Next.js 15 + React 19 (standalone output), port 3000
- **DB**: PostgreSQL 16 via Prisma ORM
- **Build**: Turbo + multi-stage Docker images already exist
- **Auth**: JWT access tokens + httpOnly refresh token cookies (already production-safe)
- **Health**: `GET /api/v1/health` pings DB and returns 503 on failure (ALB-ready)

Docker images exist for both services. The codebase works on localhost but has 6 issues that will actively break on AWS, plus several hardening gaps.

---

## Phase 1 — Critical Blockers

These will cause visible failures on AWS without being fixed.

### 1. S3 Storage Driver

**Problem:** `apps/api/src/lib/storage.ts` uses `LocalStorageDriver`, writing Excel import files to `/app/storage` on disk. ECS Fargate containers are ephemeral — files are permanently lost on every restart or redeploy.

**Fix:**
- Add `@aws-sdk/client-s3` to `apps/api/package.json`
- Add `S3StorageDriver` class to `storage.ts` implementing the existing `StorageDriver` interface
- Select driver at startup via `STORAGE_DRIVER=s3` env var
- Add `S3_BUCKET` and `S3_REGION` to `env.ts` and `.env.example`

**Files:** `apps/api/src/lib/storage.ts`, `apps/api/src/lib/env.ts`, `apps/api/package.json`, `.env.example`

---

### 2. Graceful HTTP Connection Drain

**Problem:** `apps/api/src/server.ts` handles `SIGTERM` by immediately disconnecting Prisma and calling `process.exit(0)`. This cuts all in-flight HTTP requests. ECS sends `SIGTERM` and then waits up to 30 seconds before force-killing the container — that window exists precisely to drain traffic, but the app isn't using it.

**Fix:** On `SIGTERM`, stop accepting new connections first (`server.close()`), give in-flight requests 10 seconds to complete, then disconnect Prisma and exit.

**Files:** `apps/api/src/server.ts`

---

### 3. `NEXT_PUBLIC_API_URL` Baked at Build Time

**Problem:** Next.js 15 bakes `NEXT_PUBLIC_*` variables into the static JS bundle at `next build`. `docker-compose.yml` sets this to `http://localhost:3001/api/v1`, which gets embedded in the image. On AWS, the API will be at a real domain (e.g., `https://api.company.com`) — browsers will silently call localhost and fail.

**Fix:** Add `ARG NEXT_PUBLIC_API_URL` to `docker/Dockerfile.web` so the CI pipeline passes the correct public API URL at image build time.

**Files:** `docker/Dockerfile.web`

---

## Phase 2 — Production Hardening

Important for stability and operability on AWS, but won't cause immediate hard failures.

### 4. Structured JSON Logging

**Problem:** The API uses `console.log` for all output. CloudWatch Logs ingests plain text but is much more useful with JSON — you can filter by field, create metric filters, set alarms on error rates, and use Insights queries.

**Fix:**
- Add `pino` + `pino-http` to `apps/api/package.json`
- Create `apps/api/src/lib/logger.ts` exporting a pino instance
- Add `pino-http` as request logging middleware in `app.ts`
- Replace `console.log` in `server.ts` with the logger

**Files:** `apps/api/src/lib/logger.ts` (new), `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/package.json`

---

### 5. CORS Production Guard + Multi-Origin Support

**Problem:** `env.ts` uses `opt('CORS_ORIGIN', 'http://localhost:3002')` — if `CORS_ORIGIN` is not set in production, the API silently allows requests from `localhost:3002` and blocks the real frontend. Also, a single-string origin doesn't support multiple allowed domains (e.g., apex + www, or staging + prod).

**Fix:**
- Make `CORS_ORIGIN` required when `NODE_ENV=production` (throw at startup if missing)
- Parse comma-separated values into an array so multiple origins work

**Files:** `apps/api/src/lib/env.ts`, `apps/api/src/app.ts`

---

### 6. Database Connection Pool Limit

**Problem:** Prisma's default pool size is `min(10, CPU_COUNT * 2 + 1)`. With multiple ECS tasks all connecting to RDS, the aggregate connection count can quickly hit RDS limits (e.g., `db.t3.micro` has a max of ~87 connections). No explicit limit is set.

**Fix:** Add `DATABASE_CONNECTION_LIMIT` env var (default `5` for containerized workloads) wired into the Prisma client constructor via the `datasources` option.

**Files:** `apps/api/src/lib/prisma.ts`, `apps/api/src/lib/env.ts`, `.env.example`

---

### 7. Non-Root User in API Dockerfile

**Problem:** `docker/Dockerfile.web` already uses a non-root `nextjs` user (uid 1001). `docker/Dockerfile.api` runs as root — violating the principle of least privilege and flagged by AWS security benchmarks (CIS Docker).

**Fix:** Add a non-root `node` user (uid 1001) to the API runtime stage and `chown` the app directory.

**Files:** `docker/Dockerfile.api`

---

### 8. Fix `pnpm-lock.yaml*` Glob in Dockerfiles

**Problem:** Both Dockerfiles use `COPY pnpm-lock.yaml* ./`. The `*` glob silently skips the lockfile if it's missing, producing non-reproducible builds without any error.

**Fix:** Change to `COPY pnpm-lock.yaml ./` in both Dockerfiles.

**Files:** `docker/Dockerfile.api`, `docker/Dockerfile.web`

---

## Phase 3 — CI/CD Pipeline

### 9. GitHub Actions Workflow

**Problem:** No `.github/workflows/` directory exists. Docker images must be built manually and pushed to ECR by hand — error-prone and not scalable.

**Fix:** Add `.github/workflows/deploy.yml` with:
1. Trigger on push to `main`
2. Configure AWS credentials from GitHub secrets
3. Login to ECR
4. Build API image with `--platform linux/amd64` (Fargate default)
5. Build Web image with `--platform linux/amd64` and pass `NEXT_PUBLIC_API_URL` as build arg
6. Push both images to ECR
7. Trigger ECS service update (force new deployment)

**Files:** `.github/workflows/deploy.yml` (new)

---

## What Will NOT Change

| Area | Reason |
|---|---|
| Cookie security | Already correct: `secure: process.env['NODE_ENV'] === 'production'` in `auth.controller.ts` |
| Health check endpoint | Already excellent — `GET /api/v1/health` pings DB, returns 503 on failure |
| Rate limiting store | In-memory per-instance is acceptable; cross-instance sharing needs Redis (ElastiCache) but is an operational concern, not a code blocker |
| `docker-compose.yml` | Keeps working for local dev as-is |
| AWS infrastructure | RDS, ECS cluster, ALB, ECR, VPC, IAM — IaC/ops work outside the codebase |

---

## Files Changed / Created

| File | Type | What Changes |
|---|---|---|
| `apps/api/src/lib/storage.ts` | Modify | Add `S3StorageDriver`, driver selection by env var |
| `apps/api/src/lib/env.ts` | Modify | S3 vars, CORS production guard, DB pool limit var |
| `apps/api/src/lib/logger.ts` | **New** | pino-based structured logger |
| `apps/api/src/lib/prisma.ts` | Modify | Wire `DATABASE_CONNECTION_LIMIT` into client |
| `apps/api/src/server.ts` | Modify | Graceful HTTP drain, use structured logger |
| `apps/api/src/app.ts` | Modify | pino-http request logging, multi-origin CORS |
| `apps/api/package.json` | Modify | Add `pino`, `pino-http`, `@aws-sdk/client-s3` |
| `docker/Dockerfile.api` | Modify | Non-root user, fix `pnpm-lock.yaml` glob |
| `docker/Dockerfile.web` | Modify | `ARG NEXT_PUBLIC_API_URL`, fix `pnpm-lock.yaml` glob |
| `.env.example` | Modify | Document all AWS-specific variables |
| `.github/workflows/deploy.yml` | **New** | Build → ECR push → ECS deploy CI/CD |

---

## Required AWS Secrets (GitHub Actions)

These must be set as repository secrets before the pipeline can run:

```
AWS_ACCESS_KEY_ID         — IAM user/role with ECR push + ECS deploy permissions
AWS_SECRET_ACCESS_KEY     — Corresponding secret
AWS_REGION                — e.g. ap-south-1
ECR_API_REPOSITORY_URI    — e.g. 123456789.dkr.ecr.ap-south-1.amazonaws.com/sprintflow-api
ECR_WEB_REPOSITORY_URI    — e.g. 123456789.dkr.ecr.ap-south-1.amazonaws.com/sprintflow-web
ECS_CLUSTER               — ECS cluster name
ECS_API_SERVICE           — ECS service name for the API
ECS_WEB_SERVICE           — ECS service name for the Web
NEXT_PUBLIC_API_URL       — Public API URL e.g. https://api.company.com/api/v1
```

---

## Required AWS Environment Variables (ECS Task Definitions)

These must be set in ECS task definitions (via Parameter Store or Secrets Manager):

```
# Database (RDS)
DATABASE_URL=postgresql://sprintflow:<password>@<rds-host>:5432/sprintflow?schema=public&connection_limit=5

# Auth
JWT_ACCESS_SECRET=<strong-random-≥32-chars>
JWT_REFRESH_SECRET=<strong-random-≥32-chars>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS — must match the web frontend's public domain
CORS_ORIGIN=https://app.company.com

# Storage — use S3 on AWS
STORAGE_DRIVER=s3
S3_BUCKET=sprintflow-uploads-prod
S3_REGION=ap-south-1
STORAGE_MAX_FILE_SIZE_MB=20

# Runtime
NODE_ENV=production
API_PORT=3001

# DB connection pool (tune per ECS task count vs RDS max_connections)
DATABASE_CONNECTION_LIMIT=5
```
