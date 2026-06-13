-- RBAC Phase C: add DEACTIVATED to UserStatus enum
-- Must run in its own transaction (enum value additions committed before use)
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DEACTIVATED';
