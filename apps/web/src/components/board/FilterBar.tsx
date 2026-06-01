'use client';

import { useQuery } from '@tanstack/react-query';
import { useBoardStore } from '@/store/board.store';
import { useProjectStore } from '@/store/project.store';
import { getMyWorkspace } from '@/lib/api/workspaces';
import { listWorkspaceUsers } from '@/lib/api/users';

const PRIORITIES = ['P0', 'P1', 'P2'] as const;

interface Props {
  workspaceId: string;
}

export function FilterBar({ workspaceId }: Props) {
  const filters      = useBoardStore((s) => s.filters);
  const setFilter    = useBoardStore((s) => s.setFilter);
  const clearFilters = useBoardStore((s) => s.clearFilters);

  // Use persisted activeProjectId to look up the active project inside the
  // fresh workspace query — avoids relying on stale activeProject object.
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: getMyWorkspace,
    staleTime: 60_000,
  });

  const { data: usersResult } = useQuery({
    queryKey: ['users', workspaceId],
    queryFn: () => listWorkspaceUsers(workspaceId),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  // Resolve the active project from workspace data (more reliable than store object after refresh)
  const activeProject =
    workspace?.projects.find((p) => p.id === activeProjectId) ??
    workspace?.projects[0] ??
    null;

  // Merge project-scoped sprints/epics (post-import) with legacy workspace-scoped ones
  // de-duplicate by id so legacy and project lists never show duplicates
  const sprintMap = new Map([
    ...(workspace?.sprints ?? []).map((s) => [s.id, s] as const),
    ...(activeProject?.sprints ?? []).map((s) => [s.id, s] as const),
  ]);
  const epicMap = new Map([
    ...(workspace?.epics ?? []).map((e) => [e.id, e] as const),
    ...(activeProject?.epics ?? []).map((e) => [e.id, e] as const),
  ]);

  const sprints = [...sprintMap.values()];
  const epics   = [...epicMap.values()];

  const hasActive = Object.values(filters).some(Boolean);

  const selectCls = (active: boolean) =>
    `rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      active
        ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`;

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {/* Sprint */}
      <select
        aria-label="Filter by sprint"
        value={filters.sprint ?? ''}
        onChange={(e) => setFilter('sprint', e.target.value || undefined)}
        className={selectCls(!!filters.sprint)}
      >
        <option value="">All sprints</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      {/* Owner */}
      <select
        aria-label="Filter by owner"
        value={filters.owner ?? ''}
        onChange={(e) => setFilter('owner', e.target.value || undefined)}
        className={selectCls(!!filters.owner)}
      >
        <option value="">All owners</option>
        {usersResult?.data.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>

      {/* Epic */}
      <select
        aria-label="Filter by epic"
        value={filters.epic ?? ''}
        onChange={(e) => setFilter('epic', e.target.value || undefined)}
        className={selectCls(!!filters.epic)}
      >
        <option value="">All epics</option>
        {epics.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      {/* Priority */}
      <select
        aria-label="Filter by priority"
        value={filters.priority ?? ''}
        onChange={(e) => setFilter('priority', e.target.value || undefined)}
        className={selectCls(!!filters.priority)}
      >
        <option value="">All priorities</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
        ))}
      </select>

      {/* Clear */}
      {hasActive && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
        >
          × Clear filters
        </button>
      )}
    </div>
  );
}

