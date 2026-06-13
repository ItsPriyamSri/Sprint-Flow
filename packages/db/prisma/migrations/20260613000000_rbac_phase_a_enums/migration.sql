-- Phase A step 1/2: Add new enum values only.
-- These must be committed before they can be used in the next migration.

ALTER TYPE "GlobalRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'ADMIN';

ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'USER_ROLE_CHANGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'USER_DEACTIVATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'USER_PROVISIONED';
