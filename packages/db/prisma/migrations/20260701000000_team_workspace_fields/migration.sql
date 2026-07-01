-- AlterTable: add optional description and archivedAt to Workspace (supports team management UI)
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
