-- AlterTable
ALTER TABLE "User" ADD COLUMN     "linkedToId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_linkedToId_fkey" FOREIGN KEY ("linkedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
