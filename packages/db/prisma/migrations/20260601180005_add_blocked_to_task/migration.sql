-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityAction" ADD VALUE 'TASK_BLOCKED';
ALTER TYPE "ActivityAction" ADD VALUE 'TASK_UNBLOCKED';

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockedReason" TEXT;
