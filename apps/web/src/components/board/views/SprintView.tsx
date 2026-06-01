'use client';

import type { BoardDto, BoardTask } from '@/lib/api/boards';
import { columnLabelForTask } from '@/lib/api/boards';
import { useBoardStore } from '@/store/board.store';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};

const SPRINT_STATUS_COLOR: Record<string, string> = {
  PLANNING:  'bg-slate-100 text-slate-600',
  ACTIVE:    'bg-green-100 text-green-700',
  COMPLETED: 'bg-slate-200 text-slate-500',
};

interface TaskPill extends BoardTask {}

interface Props {
  board: BoardDto;
}

export function SprintView({ board }: Props) {
  const openTask = useBoardStore((s) => s.openTask);

  const allTasks: TaskPill[] = board.columns.flatMap((col) => col.tasks);

  // Group by sprint name, preserving ordering (no sprint → last)
  const groups = new Map<string, TaskPill[]>();
  for (const task of allTasks) {
    const key = task.sprintName ?? '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(task);
  }

  const PRANK: Record<string, number> = { P0: 3, P1: 2, P2: 1 };
  const sorted = [...groups.entries()].sort(([a], [b]) =>
    a === '__none__' ? 1 : b === '__none__' ? -1 : a.localeCompare(b),
  );

  if (allTasks.length === 0) {
    return (
      <EmptyState message="No tasks match the current filters." />
    );
  }

  return (
    <div className="px-6 py-6 space-y-10">
      {sorted.map(([sprintKey, tasks]) => {
        const sprintName = sprintKey === '__none__' ? 'No Sprint' : sprintKey;
        const byPriority = [...tasks].sort(
          (a, b) => (PRANK[b.priority ?? ''] ?? 0) - (PRANK[a.priority ?? ''] ?? 0),
        );
        return (
          <section key={sprintKey} aria-label={`Sprint: ${sprintName}`}>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-base font-semibold text-slate-800">{sprintName}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
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
                    {task.epicName && (
                      <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-600">
                        {task.epicName}
                      </span>
                    )}
                  </div>
                  {task.assignments && task.assignments.length > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-100 text-[8px] font-bold text-indigo-700">
                        {task.assignments[0]!.memberName.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-[10px] text-slate-400">{task.assignments[0]!.memberName}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-64 items-center justify-center text-slate-400">
      {message}
    </div>
  );
}
