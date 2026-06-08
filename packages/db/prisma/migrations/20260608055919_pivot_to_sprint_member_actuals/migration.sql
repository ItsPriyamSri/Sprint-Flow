/*
  Warnings:

  - You are about to drop the column `actualHours` on the `TaskAssignment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TaskAssignment" DROP COLUMN "actualHours";

-- CreateTable
CREATE TABLE "SprintMemberActual" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "projectMemberId" TEXT NOT NULL,
    "actualHours" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "SprintMemberActual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintMemberActual_sprintId_idx" ON "SprintMemberActual"("sprintId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintMemberActual_sprintId_projectMemberId_key" ON "SprintMemberActual"("sprintId", "projectMemberId");

-- AddForeignKey
ALTER TABLE "SprintMemberActual" ADD CONSTRAINT "SprintMemberActual_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintMemberActual" ADD CONSTRAINT "SprintMemberActual_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
