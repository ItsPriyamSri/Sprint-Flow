import { apiFetch } from './client';

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  diff: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    committed?: number;
    skipped?: number;
    deletedTasks?: number;
  } | null;
  actor: { id: string; name: string };
  createdAt: string;
}

export async function getActivity(
  workspaceId: string,
  options: { entityId?: string; cursor?: string; limit?: number } = {},
) {
  const params = new URLSearchParams({ workspaceId });
  if (options.entityId) params.set('entityId', options.entityId);
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.limit) params.set('limit', String(options.limit));
  return apiFetch<{ data: ActivityEntry[]; nextCursor: string | null }>(`/activity?${params}`);
}

// Human-readable description for each action type.
export function describeActivity(entry: ActivityEntry): string {
  const d = entry.diff;
  switch (entry.action) {
    case 'TASK_CREATED':   return 'created this task';
    case 'TASK_DELETED':   return 'deleted this task';
    case 'TASK_COMMENTED': return 'added a comment';
    case 'TASK_MOVED':
      return d?.before && d?.after
        ? `moved from "${String((d.before as Record<string,unknown>)['columnName'])}" → "${String((d.after as Record<string,unknown>)['columnName'])}"`
        : 'moved this task';
    case 'TASK_UPDATED': {
      if (!d?.before) return 'updated this task';
      const changed = Object.keys(d.before);
      return `updated ${changed.join(', ')}`;
    }
    case 'TASK_BLOCKED': {
      const reason = d?.after ? String((d.after as Record<string, unknown>)['blockedReason'] || '') : '';
      return `blocked this task${reason ? ` (${reason})` : ''}`;
    }
    case 'TASK_UNBLOCKED': return 'unblocked this task';
    case 'IMPORT_COMMITTED': return `imported ${d?.committed ?? 0} tasks`;
    case 'IMPORT_ROLLED_BACK': return `rolled back import (${d?.deletedTasks ?? 0} tasks removed)`;
    case 'SPRINT_CREATED':  return 'created a sprint';
    case 'SPRINT_UPDATED':  return 'updated a sprint';
    case 'COLUMN_ADDED':    return 'added a column';
    case 'COLUMN_REORDERED':return 'reordered columns';
    default: return entry.action.toLowerCase().replace(/_/g, ' ');
  }
}

export function timeAgo(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoDate).toLocaleDateString();
}
