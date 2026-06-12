// Each entry: ordered by specificity (more specific patterns first).
export const FIELD_PATTERNS: Array<{ field: string; patterns: string[] }> = [
  { field: 'sprintName',  patterns: ['sprint'] },
  // "ID" must come before "task" to avoid "task id" matching title
  { field: 'externalId',  patterns: ['id', 'taskid', 'issueid', 'ticketid'] },
  // "Task / Story" normalises to "taskstory"
  { field: 'title',       patterns: ['taskstory', 'task', 'story', 'title', 'summary'] },
  { field: 'epicName',    patterns: ['epic', 'epicname', 'epiclabel'] },
  { field: 'ownerName',   patterns: ['owner', 'assignee', 'assignedto', 'responsible'] },
  // hoursN: planned/estimated hours — covers "Hrs Est.", "Est Hrs", "Hrs Estimated", "Hours Est." etc.
  { field: 'hoursN',      patterns: ['hrsn', 'hoursn', 'hrsnormalized', 'hrsest', 'hrsestimated', 'esthrs', 'esthours', 'estimated', 'estimate'] },
  { field: 'hoursI',      patterns: ['hrsi', 'hoursi', 'hoursincurred', 'actual', 'spent', 'incurred'] },
  { field: 'hoursTotal',  patterns: ['total', 'totalhours', 'totalhrs', 'hrs'] },
  { field: 'priority',    patterns: ['priority', 'prio', 'importance', 'urgency'] },
  { field: 'notes',       patterns: ['notes', 'note', 'comments', 'comment', 'remarks', 'deferred'] },
  { field: 'status',      patterns: ['status', 'state', 'stage', 'phase'] },
];

// Minimum distinct fields that must match for a row to be accepted as the header row.
export const MIN_HEADER_MATCHES = 3;

// Maximum rows scanned to find the header (safety limit for large leading meta sections).
export const HEADER_SCAN_LIMIT = 30;

// Free-text status → canonical column key.
export const STATUS_MAP: Record<string, string> = {
  backlog: 'backlog',
  open: 'backlog',
  new: 'backlog',
  deferred: 'backlog',
  // Sprint-ready but not yet picked up → Todo (not Backlog)
  'not started': 'todo',
  'not yet started': 'todo',
  todo: 'todo',
  'to do': 'todo',
  'to-do': 'todo',
  planned: 'todo',
  ready: 'todo',
  queued: 'todo',
  'in progress': 'in_progress',
  'in-progress': 'in_progress',
  inprogress: 'in_progress',
  wip: 'in_progress',
  active: 'in_progress',
  doing: 'in_progress',
  started: 'in_progress',
  ongoing: 'in_progress',
  review: 'review',
  'in review': 'review',
  'under review': 'review',
  testing: 'review',
  qa: 'review',
  'code review': 'review',
  done: 'done',
  complete: 'done',
  completed: 'done',
  finished: 'done',
  closed: 'done',
  resolved: 'done',
  delivered: 'done',
  shipped: 'done',
};

// Free-text priority → P0/P1/P2 enum value.
// P0 = must-ship (launch-blocking), P1 = should-ship, P2 = nice-to-have
export const PRIORITY_MAP: Record<string, string> = {
  // Explicit P-notation (from CARR Excel sheets)
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
  p3: 'P2', // treat P3 as P2 (no dedicated tier)
  p4: 'P2', // treat P4 as P2 (low-priority tier)
  // Critical → P0
  critical: 'P0',
  crit: 'P0',
  urgent: 'P0',
  blocker: 'P0',
  // High → P1
  high: 'P1',
  h: 'P1',
  important: 'P1',
  major: 'P1',
  // Medium → P2
  medium: 'P2',
  med: 'P2',
  m: 'P2',
  normal: 'P2',
  moderate: 'P2',
  // Low → P2
  low: 'P2',
  l: 'P2',
  minor: 'P2',
};

// NULL-equivalent strings: treat these as empty.
export const NULL_VALUES = new Set(['', '-', 'n/a', 'na', 'none', 'null', 'undefined', 'tbd', '-']);
