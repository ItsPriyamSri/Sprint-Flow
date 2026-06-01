-- ─── Phase 0: Scrum Platform Schema Migration ────────────────────────────────
-- Adds: Project, ProjectMember, TaskAssignment
-- Extends: Sprint (goal/days/release), Epic (projectId), Task (projectId/done/deferred)
-- Changes: TaskPriority enum → P0/P1/P2
-- Removes: Task.assigneeId, Task.hoursN, Task.hoursI, Task.hoursTotal
-- Adds: ProjectRole enum, new ActivityAction values

-- ─── 1. New enums ─────────────────────────────────────────────────────────────

CREATE TYPE "ProjectRole" AS ENUM ('LEAD', 'MEMBER', 'VIEWER');

-- Add new ActivityAction values (non-transactional in some PG versions — tolerated for dev)
DO $$ BEGIN
  ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_DONE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_DEFERRED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PROJECT_CREATED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Migrate TaskPriority enum LOW/MEDIUM/HIGH/CRITICAL → P0/P1/P2 ────────

ALTER TYPE "TaskPriority" RENAME TO "TaskPriority_old";
CREATE TYPE "TaskPriority" AS ENUM ('P0', 'P1', 'P2');

-- Drop the FK on Task.assigneeId before altering the table
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_assigneeId_fkey";
DROP INDEX IF EXISTS "Task_assigneeId_idx";

-- Convert priority column values
ALTER TABLE "Task" ALTER COLUMN "priority" TYPE "TaskPriority" USING (
  CASE "priority"::text
    WHEN 'CRITICAL' THEN 'P0'::"TaskPriority"
    WHEN 'HIGH'     THEN 'P1'::"TaskPriority"
    WHEN 'MEDIUM'   THEN 'P2'::"TaskPriority"
    WHEN 'LOW'      THEN 'P2'::"TaskPriority"
    ELSE NULL
  END
);

DROP TYPE "TaskPriority_old";

-- ─── 3. Create Project table ─────────────────────────────────────────────────

CREATE TABLE "Project" (
  "id"            TEXT         NOT NULL,
  "workspaceId"   TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "description"   TEXT,
  "daysPerSprint" INTEGER      NOT NULL DEFAULT 6,
  "daysPerWeek"   INTEGER      NOT NULL DEFAULT 6,
  "releaseDate"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 4. Create ProjectMember table ───────────────────────────────────────────

CREATE TABLE "ProjectMember" (
  "id"          TEXT         NOT NULL,
  "projectId"   TEXT         NOT NULL,
  "userId"      TEXT         NOT NULL,
  "role"        "ProjectRole" NOT NULL DEFAULT 'MEMBER',
  "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 6,
  "joinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectMember_projectId_userId_key" UNIQUE ("projectId", "userId")
);

CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 5. Create TaskAssignment table ──────────────────────────────────────────

CREATE TABLE "TaskAssignment" (
  "id"              TEXT         NOT NULL,
  "taskId"          TEXT         NOT NULL,
  "projectMemberId" TEXT         NOT NULL,
  "hours"           DECIMAL(8,2) NOT NULL DEFAULT 0,
  CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskAssignment_taskId_projectMemberId_key" UNIQUE ("taskId", "projectMemberId")
);

CREATE INDEX "TaskAssignment_taskId_idx" ON "TaskAssignment"("taskId");

ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_projectMemberId_fkey"
  FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 6. Extend Sprint ────────────────────────────────────────────────────────

ALTER TABLE "Sprint" ADD COLUMN "projectId"        TEXT;
ALTER TABLE "Sprint" ADD COLUMN "goal"             TEXT;
ALTER TABLE "Sprint" ADD COLUMN "days"             INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "Sprint" ADD COLUMN "releaseMilestone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sprint" ADD COLUMN "releaseLabel"     TEXT;
ALTER TABLE "Sprint" ADD COLUMN "releaseDate"      TIMESTAMP(3);

CREATE INDEX "Sprint_projectId_idx" ON "Sprint"("projectId");

ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 7. Extend Epic ──────────────────────────────────────────────────────────

ALTER TABLE "Epic" ADD COLUMN "projectId" TEXT;

CREATE INDEX "Epic_projectId_idx" ON "Epic"("projectId");

ALTER TABLE "Epic" ADD CONSTRAINT "Epic_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 8. Extend Task ──────────────────────────────────────────────────────────

ALTER TABLE "Task" ADD COLUMN "projectId"      TEXT;
ALTER TABLE "Task" ADD COLUMN "done"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "deferred"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "deferredReason" TEXT;

CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 9. Drop obsolete Task columns ───────────────────────────────────────────

ALTER TABLE "Task" DROP COLUMN IF EXISTS "assigneeId";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "hoursN";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "hoursI";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "hoursTotal";
