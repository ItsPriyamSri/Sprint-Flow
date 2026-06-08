# AWS Deployment Readiness Plan

> Verified against the codebase (file-by-file) and current AWS / Next.js / Prisma
> best practices (June 2026). This revision corrects one technical error in the
> original plan, closes three production-correctness gaps, and adds the AWS
> IAM / Secrets / OIDC essentials the original omitted.

## Current State

SprintFlow is a pnpm monorepo with:
- **API**: Express.js 4.21 + TypeScript on Node 22 (`node:22-alpine`), port 3001
- **Web**: Next.js 15.1 + React 19 (standalone output), port 3000
- **DB**: PostgreSQL 16 via Prisma ORM 6.1
- **Build**: Turbo + multi-stage Docker images already exist
- **Migrations**: `prisma migrate deploy` already runs from `docker/docker-entrypoint.sh` (`exec node …`, so SIGTERM correctly reaches the Node process)
- **Auth**: JWT access tokens + httpOnly refresh-token cookies (`httpOnly`, `sameSite:'strict'`, `secure` in prod — already production-safe)
- **Health**: `GET /api/v1/health` pings DB and returns 503 on failure (ALB-ready)

Docker images exist for both services. The codebase works on localhost but has issues that will break — or silently misbehave — on AWS, plus hardening gaps and AWS-side prerequisites that must be in place before the first deploy.

---

## Phase 1 — Critical Blockers

These will cause visible failures (or a security exposure) on AWS without being fixed.

### 1. S3 Storage Driver

**Problem:** `apps/api/src/lib/storage.ts` only implements `LocalStorageDriver`, writing Excel import files to `/app/storage` on disk (`STORAGE_DRIVER` is typed `as 'local'`). ECS Fargate containers are ephemeral — files are permanently lost on every restart or redeploy.

**Fix:**
- Add `@aws-sdk/client-s3` to `apps/api/package.json`
- Add an `S3StorageDriver` class to `storage.ts` implementing the existing `StorageDriver` interface (`store`/`read`/`remove`)
- Widen the `STORAGE_DRIVER` type to `'local' | 's3'` and select the driver at startup
- Add `S3_BUCKET` and `S3_REGION` to `env.ts` and `.env.example`
- **Credentials:** the S3 client must use the **default AWS credential provider chain** (the ECS task role) — do **not** read `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` from env in the app. The ECS **task role** needs an IAM policy granting `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*` (see AWS Prerequisites below).

**Files:** `apps/api/src/lib/storage.ts`, `apps/api/src/lib/env.ts`, `apps/api/package.json`, `.env.example`

---

### 2. Graceful HTTP Connection Drain

**Problem:** `apps/api/src/server.ts:26-29` handles `SIGTERM` by immediately disconnecting Prisma and calling `process.exit(0)`. This cuts all in-flight HTTP requests. When ECS stops a task it sends `SIGTERM` and waits up to the task `stopTimeout` (default 30s) before `SIGKILL` — that window exists to drain traffic, but the app doesn't use it.

**Fix:**
- On `SIGTERM` (and `SIGINT`), stop accepting new connections first (`server.close()`), give in-flight requests ~10s to complete, then `prisma.$disconnect()` and exit.
- The entrypoint already uses `exec node …`, so Node is PID 1 and receives the signal directly — no change needed there. (If the entrypoint is ever refactored, the `exec` must be preserved or SIGTERM will be swallowed by the shell.)

**AWS-side note (for the task definition, not code):** ECS **deregisters the task from the ALB target group before sending SIGTERM**, so new traffic already stops at the LB. Set the ECS task `stopTimeout` ≥ the drain window (e.g. 30s) and the ALB target-group `deregistration_delay` to a sane value (e.g. 30s). The 10s in-app drain only covers requests already in flight.

**Files:** `apps/api/src/server.ts`

---

### 3. Prevent Production Seeding with Default Admin Credentials  🔴 SECURITY

**Problem:** `packages/db/src/seed.ts` creates an admin user defaulting to `admin@sprintflow.local` / `Admin1234!` (via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). If the seed ever runs in production, the deployment ships with publicly-known admin credentials. The entrypoint runs `migrate deploy` (not seed) today, but seeding is one script invocation away and must be explicitly fenced off.

**Fix:**
- Guard `seed.ts` so it **refuses to run when `NODE_ENV=production`** unless `SEED_ADMIN_PASSWORD` is explicitly provided and passes the same strength check used for JWT secrets (≥12 chars, not a known weak/default value).
- Confirm the production deploy path **never** invokes the seed (it currently doesn't — keep it that way; only `migrate deploy` runs at startup).

**Files:** `packages/db/src/seed.ts`

---

### 4. `NEXT_PUBLIC_API_URL` Baked at Build Time

**Problem:** Next.js 15 inlines `NEXT_PUBLIC_*` variables into the static JS bundle at `next build`. `docker-compose.yml` sets it to `http://localhost:3001/api/v1`, which would get embedded in the image. On AWS the API lives at a real domain (e.g. `https://api.company.com/api/v1`) — browsers would otherwise call localhost and fail. `docker/Dockerfile.web` currently has **no** `ARG` for it.

**Fix:** Add `ARG NEXT_PUBLIC_API_URL` (promoted to `ENV` before `next build`) in `docker/Dockerfile.web` so CI passes the correct public API URL at image build time.

**Tradeoff (documented, accepted):** build-arg baking ties each image to one environment — fine for a single production target, but staging and prod require separate image builds (tag by environment as well as git SHA). The alternative — true runtime injection via a `window.__ENV` script + `next-runtime-env` — is more complex and **out of scope** unless/until a second environment is needed.

**Files:** `docker/Dockerfile.web`

---

## Phase 2 — Production Hardening

Important for stability, security, and operability on AWS, but won't cause an immediate hard failure on day one.

### 5. Structured JSON Logging

**Problem:** The API uses `console.log`/`console.error` (e.g. `server.ts:22-23`, `middleware/error.ts:47`). CloudWatch ingests plain text but is far more useful with JSON — filter by field, build metric filters, alarm on error rates, run Insights queries.

**Fix:**
- Add `pino` + `pino-http` to `apps/api/package.json`
- Create `apps/api/src/lib/logger.ts` exporting a configured pino instance
- Add `pino-http` as request-logging middleware in `app.ts`
- Replace `console.*` in `server.ts` (and the unhandled-error path in `middleware/error.ts`) with the logger

**Files:** `apps/api/src/lib/logger.ts` (new), `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/middleware/error.ts`, `apps/api/package.json`

---

### 6. CORS Production Guard + Multi-Origin Support

**Problem:** `env.ts` uses `opt('CORS_ORIGIN', 'http://localhost:3002')` and `app.ts:30` passes that single string to `cors({ origin, credentials: true })`. If `CORS_ORIGIN` is unset in production, the API silently trusts `localhost:3002` and blocks the real frontend. A single string also can't express multiple allowed domains (apex + www, staging + prod).

**Fix:**
- Make `CORS_ORIGIN` **required** when `NODE_ENV=production` (throw at startup if missing — same pattern as the existing JWT-secret guard in `server.ts:6-17`)
- Parse comma-separated values into an array so multiple origins work

**Files:** `apps/api/src/lib/env.ts`, `apps/api/src/app.ts`

---

### 7. Database Connection Pool Limit  *(corrected mechanism)*

**Problem:** Prisma's default pool size is `physical_cpus * 2 + 1`. With multiple ECS tasks each opening a pool, aggregate connections can exceed RDS limits (e.g. `db.t3.micro` ≈ 87 max). `apps/api/src/lib/prisma.ts:8-12` sets no explicit limit.

**Fix:** In Prisma 6 the pool size is controlled by the **`connection_limit` query parameter on `DATABASE_URL`** — **not** by the `PrismaClient` `datasources` constructor option. So:
- Set `connection_limit` directly in `DATABASE_URL` (e.g. `…?schema=public&connection_limit=5`).
- **Do not** add a `DATABASE_CONNECTION_LIMIT` env var or modify `prisma.ts` — the original plan's `datasources`-constructor approach was incorrect and would conflict with the URL parameter. No code change is required; this is purely a configuration value in the connection string.
- Size it so that `connection_limit × max_task_count < RDS max_connections`, leaving headroom for migrations and admin sessions.

**Files:** *(none — configuration only, set via `DATABASE_URL`)*

---

### 8. Migration Strategy on Deploy  *(was missing entirely)*

**Problem:** `docker/docker-entrypoint.sh` runs `prisma migrate deploy` on **every container start**. With ≥2 ECS tasks, all tasks attempt migrations concurrently on each deploy. `migrate deploy` takes a Postgres advisory lock so it won't corrupt data, but tasks serialize/stall behind the lock and a failed migration can crash-loop the whole service.

**Fix (choose one, then document it in the runbook):**
- **Preferred:** Run migrations as a **one-off ECS task** (or a dedicated CI step) *before* the service update, and **remove** `migrate deploy` from the per-task entrypoint. The service tasks then only `exec node …`.
- **Acceptable (lower effort):** Keep migrations in the entrypoint and explicitly rely on the advisory lock, accepting brief startup serialization. Document this so it isn't mistaken for a bug.

**Files:** `docker/docker-entrypoint.sh`, `docker/Dockerfile.api`, `.github/workflows/deploy.yml` (if moving to a one-off task)

---

### 9. Non-Root User in API Dockerfile

**Problem:** `docker/Dockerfile.web` already runs as non-root `nextjs` (uid 1001). `docker/Dockerfile.api` has **no `USER` directive** — it runs as root, violating least-privilege and CIS Docker benchmarks.

**Fix:** Add a non-root user (uid 1001) to the API runtime stage, `chown` `/app` (including `/app/storage`), and add `USER` before `ENTRYPOINT`.

**Files:** `docker/Dockerfile.api`

---

### 10. Fix `pnpm-lock.yaml*` Glob in Dockerfiles

**Problem:** Both Dockerfiles use `COPY pnpm-lock.yaml* ./`. The `*` glob silently skips the lockfile if it's missing, producing non-reproducible builds with no error. The build stage even falls back to `|| pnpm install` (`Dockerfile.api:12,35`), which can resolve newer dependency versions than the lockfile pins.

**Fix:** Change to `COPY pnpm-lock.yaml ./` in both Dockerfiles and rely strictly on `pnpm install --frozen-lockfile` (drop the `|| pnpm install` fallback) so a missing/stale lockfile fails the build loudly.

**Files:** `docker/Dockerfile.api`, `docker/Dockerfile.web`

---

## Phase 3 — CI/CD Pipeline

### 11. GitHub Actions Workflow

**Problem:** No `.github/workflows/` directory exists. Images are built and pushed by hand — error-prone and not scalable.

**Fix:** Add `.github/workflows/deploy.yml` with:
1. Trigger on push to `main`
2. **Authenticate to AWS via GitHub OIDC role assumption** (`aws-actions/configure-aws-credentials` with `role-to-assume` + `permissions: id-token: write`) — **no long-lived `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` stored as repo secrets** (AWS-recommended default in 2026)
3. Login to ECR (`aws-actions/amazon-ecr-login`)
4. Build **API** image with `--platform linux/amd64` (Fargate default), **tagged by git SHA** (not mutable `latest`)
5. Build **Web** image with `--platform linux/amd64`, passing `NEXT_PUBLIC_API_URL` as a build arg, tagged by git SHA
6. Push both images to ECR
7. **(If migrations moved out of the entrypoint)** run the one-off migration task and wait for success
8. Deploy via **`aws-actions/amazon-ecs-deploy-task-definition`** — render a new task-definition revision pointing at the SHA-tagged image and update the service (enables clean rollback to a prior revision). Avoid `force-new-deployment` on a mutable `latest` tag, which makes "what's actually running" ambiguous and breaks rollback.

**Files:** `.github/workflows/deploy.yml` (new)

---

## What Will NOT Change

| Area | Reason |
|---|---|
| Cookie security | Already correct: `httpOnly`, `sameSite:'strict'`, `secure: NODE_ENV==='production'` in `auth.controller.ts:4-11`. With web + API on the same registrable domain (`*.company.com`), `sameSite:'strict'` lets the refresh cookie flow; only revisit if they end up on unrelated domains. |
| Health check endpoint | Already excellent — `GET /api/v1/health` runs `SELECT 1`, returns 503 on failure (`health.routes.ts:6-13`) |
| Prisma client construction | No code change — pool sizing is done via `DATABASE_URL` (see item 7) |
| Rate limiting store | In-memory per-task (`app.ts:33`, 500 req/15min). Effective limit scales with task count; cross-instance sharing needs Redis (ElastiCache) — an operational concern, not a code blocker |
| `docker-compose.yml` | Keeps working for local dev as-is |

---

## Files Changed / Created

| File | Type | What Changes |
|---|---|---|
| `apps/api/src/lib/storage.ts` | Modify | Add `S3StorageDriver`, widen `STORAGE_DRIVER` type, select driver by env var |
| `apps/api/src/lib/env.ts` | Modify | `S3_BUCKET`/`S3_REGION` vars, CORS production guard + multi-origin parse |
| `apps/api/src/lib/logger.ts` | **New** | pino-based structured logger |
| `apps/api/src/server.ts` | Modify | Graceful HTTP drain (`server.close()` + 10s) on SIGTERM/SIGINT, use structured logger |
| `apps/api/src/app.ts` | Modify | `pino-http` request logging, multi-origin CORS |
| `apps/api/src/middleware/error.ts` | Modify | Replace `console.error` with structured logger |
| `apps/api/package.json` | Modify | Add `pino`, `pino-http`, `@aws-sdk/client-s3` |
| `packages/db/src/seed.ts` | Modify | Refuse to run in prod without an explicitly-strong admin password |
| `docker/Dockerfile.api` | Modify | Non-root user (uid 1001) + `chown`, fix `pnpm-lock.yaml` glob, drop `|| pnpm install` fallback |
| `docker/Dockerfile.web` | Modify | `ARG NEXT_PUBLIC_API_URL`, fix `pnpm-lock.yaml` glob |
| `docker/docker-entrypoint.sh` | Modify *(if chosen)* | Remove `migrate deploy` if migrations move to a one-off task (item 8) |
| `.env.example` | Modify | Document all AWS-specific variables |
| `.github/workflows/deploy.yml` | **New** | OIDC auth → SHA-tagged build → ECR push → (migrate) → ECS task-def deploy |
| `apps/api/src/lib/prisma.ts` | **No change** | Pool size set via `DATABASE_URL` `connection_limit` param, not in code |

---

## AWS Prerequisites (infrastructure — outside the codebase, but required before deploy)

IaC/console work that must exist for the above to function:

- **ECS task role** with an IAM policy granting `s3:PutObject`/`s3:GetObject`/`s3:DeleteObject` on the uploads bucket (the API uses the task role, not env keys — see item 1).
- **ECS task execution role** with permission to pull from ECR, write to the CloudWatch log group, and read the Secrets Manager / SSM secrets referenced by the task definition.
- **GitHub OIDC identity provider + deploy role** in IAM (trust policy scoped to this repo + `main`), with least-privilege ECR-push and ECS-deploy permissions (see item 11).
- **RDS** in private subnets, security group allowing only the ECS task SG on 5432, `max_connections` sized vs `connection_limit × task_count` (item 7).
- **ALB** with HTTPS listener (ACM cert), target groups for web (3000) and API (3001), health check on `/api/v1/health`, and `deregistration_delay` aligned with the drain window (item 2).
- **S3 bucket** for uploads (versioning + SSE; block public access).
- **CloudWatch** log group(s) for the JSON logs (item 5).

---

## Required GitHub Actions Repo Configuration

With OIDC (item 11), the only stored secrets are non-sensitive identifiers/vars:

```
AWS_ROLE_TO_ASSUME        — ARN of the IAM role GitHub OIDC assumes (replaces access keys)
AWS_REGION                — e.g. ap-south-1
ECR_API_REPOSITORY_URI    — e.g. 123456789.dkr.ecr.ap-south-1.amazonaws.com/sprintflow-api
ECR_WEB_REPOSITORY_URI    — e.g. 123456789.dkr.ecr.ap-south-1.amazonaws.com/sprintflow-web
ECS_CLUSTER               — ECS cluster name
ECS_API_SERVICE           — ECS service name for the API
ECS_WEB_SERVICE           — ECS service name for the Web
NEXT_PUBLIC_API_URL       — Public API URL, e.g. https://api.company.com/api/v1 (web build arg)
```

`workflow` permissions must include `id-token: write` (for OIDC) and `contents: read`.

---

## Required ECS Task-Definition Configuration

Sensitive values go through **Secrets Manager / SSM SecureString** referenced via the task definition's `secrets` block (resolved by the execution role) — **not** plaintext `environment`. Non-secret values can be plain `environment`.

**Secrets (`secrets` → Secrets Manager / SSM ARNs):**
```
DATABASE_URL              # includes ?schema=public&connection_limit=5  (item 7)
JWT_ACCESS_SECRET         # strong random ≥32 chars
JWT_REFRESH_SECRET        # strong random ≥32 chars
```

**Environment (non-secret `environment`):**
```
# Auth token lifetimes
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# CORS — required in prod; comma-separated for multiple origins (item 6)
CORS_ORIGIN=https://app.company.com

# Storage — S3 on AWS (credentials come from the task role, not env — item 1)
STORAGE_DRIVER=s3
S3_BUCKET=sprintflow-uploads-prod
S3_REGION=ap-south-1
STORAGE_MAX_FILE_SIZE_MB=20

# Runtime
NODE_ENV=production
API_PORT=3001
```

> The `DATABASE_CONNECTION_LIMIT` env var from the original plan is **removed** — pool
> size lives in the `connection_limit` parameter of `DATABASE_URL` (item 7).
