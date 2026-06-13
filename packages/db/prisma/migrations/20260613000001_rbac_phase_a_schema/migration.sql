-- Phase A step 2/2: Migrate data and add columns using the now-committed enum values.

-- Migrate existing ADMIN users to SUPER_ADMIN
UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';

-- Add mustChangePassword column
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
