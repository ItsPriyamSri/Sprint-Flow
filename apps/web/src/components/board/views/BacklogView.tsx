'use client';

import { useState } from 'react';
import type { BoardDto, BoardTask } from '@/lib/api/boards';
import { columnLabelForTask } from '@/lib/api/boards';
import { useBoardStore } from '@/store/board.store';

type SortKey = 'priority' | 'title' | 'sprint' | 'owner' | 'epic';
type SortDir = 'asc' | 'desc';

const PRANK: Record<string, number> = { P0: 3, P1: 2, P2: 1 };

const PRIORITY_BADGE: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};

interface RowTask extends BoardTask {}

interface Props { board: BoardDto }

export function BacklogView({ board }: Props) {
  const openTask = useBoardStore((s) => s.openTask);
  const [sortKey, setSortKey]   = useState<SortKey>('priority');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');

  const allTasks: RowTask[] = board.columns.flatMap((col) => col.tasks);

  const compare = (a: RowTask, b: RowTask): number => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'priority': return dir * ((PRANK[a.priority ?? ''] ?? 0) - (PRANK[b.priority ?? ''] ?? 0));
      case 'title':    return dir * a.title.localeCompare(b.title);
      case 'sprint':   return dir * (a.sprintName ?? '').localeCompare(b.sprintName ?? '');
      case 'owner':    return dir * (a.assignments?.[0]?.memberName ?? '').localeCompare(b.assignments?.[0]?.memberName ?? '');
      case 'epic':     return dir * (a.epicName ?? '').localeCompare(b.epicName ?? '');
      default: return 0;
    }
  };

  const rows = [...allTasks].sort(compare);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-slate-300">↕</span>;
    return <span className="ml-1 text-indigo-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const th = (label: string, col: SortKey) => (
    <th
      scope="col"
      onClick={() => toggleSort(col)}
      className="cursor-pointer select-none whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-slate-500 hover:text-slate-700"
    >
      {label}
      <SortIcon col={col} />
    </th>
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-400">
        No tasks match the current filters.
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <p className="mb-3 text-xs text-slate-400">{rows.length} task{rows.length !== 1 ? 's' : ''} · click a row to open details</p>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-400">#</th>
              <th scope="col" className="w-full px-3 py-3 text-left text-xs font-medium text-slate-500">Title</th>
              {th('Priority', 'priority')}
              {th('Sprint',   'sprint')}
              {th('Owner',    'owner')}
              {th('Epic',     'epic')}
              <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((task) => (
              <tr
                key={task.id}
                onClick={() => openTask(task.id)}
                className="cursor-pointer hover:bg-indigo-50"
              >
                <td className="px-3 py-2.5 font-mono text-[11px] text-slate-400">
                  {task.externalId ?? '—'}
                </td>
                <td className="max-w-xs px-3 py-2.5 font-medium text-slate-800">
                  <span className="line-clamp-1">{task.title}</span>
                </td>
                <td className="px-3 py-2.5">
                  {task.priority ? (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGE[task.priority]}`}>
                      {task.priority}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                  {task.sprintName ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                  {task.assignments?.[0]?.memberName ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                  {task.epicName ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    {columnLabelForTask(board, task)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
