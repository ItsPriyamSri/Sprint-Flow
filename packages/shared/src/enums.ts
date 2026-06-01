export const GlobalRole = { ADMIN: 'ADMIN', MEMBER: 'MEMBER' } as const;
export type GlobalRole = (typeof GlobalRole)[keyof typeof GlobalRole];

export const WorkspaceRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
} as const;
export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];

export const ProjectRole = {
  LEAD: 'LEAD',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
} as const;
export type ProjectRole = (typeof ProjectRole)[keyof typeof ProjectRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  UNCLAIMED: 'UNCLAIMED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// P0 = must-ship (was CRITICAL), P1 = should-ship (was HIGH), P2 = nice-to-have (was MEDIUM/LOW)
export const TaskPriority = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const SprintStatus = {
  PLANNING: 'PLANNING',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
} as const;
export type SprintStatus = (typeof SprintStatus)[keyof typeof SprintStatus];

export const ImportStatus = {
  UPLOADED: 'UPLOADED',
  PARSED: 'PARSED',
  PREVIEWED: 'PREVIEWED',
  COMMITTED: 'COMMITTED',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const ImportRowStatus = {
  VALID: 'VALID',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
  COMMITTED: 'COMMITTED',
} as const;
export type ImportRowStatus = (typeof ImportRowStatus)[keyof typeof ImportRowStatus];

export const ColumnKey = {
  BACKLOG: 'backlog',
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  DONE: 'done',
} as const;
export type ColumnKey = (typeof ColumnKey)[keyof typeof ColumnKey];
