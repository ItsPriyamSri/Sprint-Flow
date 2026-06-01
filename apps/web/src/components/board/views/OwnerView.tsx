'use client';

import type { BoardDto, BoardTask } from '@/lib/api/boards';
import { columnLabelForTask } from '@/lib/api/boards';
import { useBoardStore } from '@/store/board.store';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};

const PRANK: Record<string, number> = { P0: 3, P1: 2, P2: 1 };

interface TaskWithCol extends BoardTask {}

interface Props { board: BoardDto }

export function OwnerView({ board }: Props) {
  const openTask = useBoardStore((s) => s.openTask);

  const allTasks: TaskWithCol[] = board.columns.flatMap((col) => col.tasks);

  // Group by first assignment member name (or unassigned)
  const groups = new Map<string, TaskWithCol[]>();
  for (const task of allTasks) {
    const key = task.assignments?.[0]?.memberName ?? '__unassigned__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }

  const sorted = [...groups.entries()].sort(([a], [b]) =>
    a === '__unassigned__' ? 1 : b === '__unassigned__' ? -1 : a.localeCompare(b),
  );

  if (allTasks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="px-6 py-6 space-y-10">
      {sorted.map(([ownerKey, tasks]) => {
        const ownerName = ownerKey === '__unassigned__' ? 'Unassigned' : ownerKey;
        const initials = ownerKey === '__unassigned__' ? '?' : ownerKey.slice(0, 2).toUpperCase();
        const byPriority = [...tasks].sort(
          (a, b) => (PRANK[b.priority ?? ''] ?? 0) - (PRANK[a.priority ?? ''] ?? 0),
        );
        return (
          <section key={ownerKey} aria-label={`Owner: ${ownerName}`}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                {initials}
              </div>
              <h2 className="text-base font-semibold text-slate-800">{ownerName}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {tasks.length} task{tasks.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {byPriority.map((task) => (
                <button
                  key={task.id}
                  onClick={() => openTask(task.id)}
                  className="group rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium text-slate-800 group-hover:text-indigo-700">
                      {task.title}
                    </p>
                    {task.priority && (
                      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {task.externalId && (
                      <span className="font-mono text-[10px] text-slate-400">#{task.externalId}</span>
                    )}
                    <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {columnLabelForTask(board, task)}
                    </span>
                    {task.sprintName && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">
                        {task.sprintName}
                      </span>
                    )}
                    {task.epicName && (
                      <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-600">
                        {task.epicName}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-64 items-center justify-center text-slate-400">
      No tasks match the current filters.
    </div>
  );
}
