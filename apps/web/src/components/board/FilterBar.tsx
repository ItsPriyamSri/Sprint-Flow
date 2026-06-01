'use client';

import { useQuery } from '@tanstack/react-query';
import { useBoardStore } from '@/store/board.store';
import { getMyWorkspace } from '@/lib/api/workspaces';
import { listWorkspaceUsers } from '@/lib/api/users';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

interface Props {
  workspaceId: string;
}

export function FilterBar({ workspaceId }: Props) {
  const filters     = useBoardStore((s) => s.filters);
  const setFilter   = useBoardStore((s) => s.setFilter);
  const clearFilters = useBoardStore((s) => s.clearFilters);

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
        {workspace?.sprints.map((s) => (
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
        {workspace?.epics.map((e) => (
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
