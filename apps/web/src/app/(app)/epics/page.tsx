'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getProjectEpics } from '@/lib/api/projects';
import { EpicFormModal } from '@/components/scrum/EpicFormModal';
import type { EpicDto, EpicTaskItemDto, EpicWithTasksDto } from '@sprintflow/shared';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-50 text-red-700 border-red-200/60',
  P1: 'bg-amber-50 text-amber-700 border-amber-200/60',
  P2: 'bg-slate-50 text-slate-600 border-slate-200/60',
};

function TaskRow({ task }: { task: EpicTaskItemDto }) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <input
            type="checkbox"
            checked={task.done}
            readOnly
            className="h-3.5 w-3.5 rounded border-slate-300 accent-indigo-600"
            aria-hidden
          />
          <span className={`truncate text-sm ${task.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
            {task.title}
          </span>
          {task.blocked && (
            <span className="flex-shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-600 uppercase">
              Blocked
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        {task.priority ? (
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY_COLORS[task.priority] ?? ''}`}>
            {task.priority}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-slate-500">
        {task.sprintName ? (
          <Link href={`/sprints/${task.sprintId}`} className="hover:text-indigo-600 hover:underline">
            {task.sprintName}
          </Link>
        ) : (
          <span className="text-slate-400">Backlog</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
        {task.totalHours > 0 ? `${task.totalHours}h` : '—'}
      </td>
    </tr>
  );
}

function EpicBlock({
  group,
  defaultOpen,
  onEdit,
}: {
  group: EpicWithTasksDto;
  defaultOpen?: boolean;
  onEdit: (epic: EpicDto) => void;
}) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const color = group.epic.color ?? '#6366f1';

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="h-3.5 w-3.5 flex-shrink-0 rounded-md" style={{ backgroundColor: color }} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 truncate">{group.epic.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {group.completedTasks} of {group.totalTasks} tasks done · {group.completionPct}%
            </p>
          </div>
          <svg
            className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onEdit(group.epic)}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
        >
          Edit epic
        </button>
      </div>

      {!collapsed && (
        <div className="px-1 pb-1">
          <div className="mx-4 mb-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${group.completionPct}%`, backgroundColor: color }}
            />
          </div>
          {group.tasks.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-400">No tasks linked to this epic yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2">Task</th>
                  <th className="px-3 py-2 w-16">Pri</th>
                  <th className="px-3 py-2">Sprint</th>
                  <th className="px-4 py-2 text-right w-16">Hours</th>
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

export default function EpicsPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [epicModal, setEpicModal] = useState<{ open: boolean; epic: EpicDto | null }>({
    open: false,
    epic: null,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1') {
      setEpicModal({ open: true, epic: null });
    }
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['project-epics', activeProjectId],
    queryFn: () => getProjectEpics(activeProjectId!),
    enabled: !!activeProjectId,
    staleTime: 15_000,
  });

  if (!activeProjectId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
        <p className="text-base font-bold text-slate-800">No active project selected</p>
        <p className="text-xs text-slate-400 mt-1">Select a project in the sidebar to view epics.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      <EpicFormModal
        isOpen={epicModal.open}
        onClose={() => setEpicModal({ open: false, epic: null })}
        projectId={activeProjectId}
        epic={epicModal.epic}
      />

      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Epics</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              All epics for{' '}
              <span className="font-semibold text-indigo-700">{data?.project.name ?? '…'}</span>
              {' '}and the tasks that implement each one.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEpicModal({ open: true, epic: null })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm shadow-indigo-100 transition-all"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Epic
          </button>
        </div>
      </div>

      <div className="flex-1 px-8 py-8 max-w-[1200px] w-full mx-auto space-y-6">
        {isLoading && (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-slate-200/80" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            Failed to load epics. Please try again.
          </div>
        )}

        {data && data.epics.length === 0 && data.unassigned.totalTasks === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-slate-600">No epics yet</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Create an epic to group related tasks.</p>
            <button
              type="button"
              onClick={() => setEpicModal({ open: true, epic: null })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Create Your First Epic
            </button>
          </div>
        )}

        {data?.epics.map((group, i) => (
          <EpicBlock
            key={group.epic.id}
            group={group}
            defaultOpen={i === 0}
            onEdit={(epic) => setEpicModal({ open: true, epic })}
          />
        ))}

        {data && data.unassigned.totalTasks > 0 && (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 overflow-hidden">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <h2 className="text-base font-bold text-slate-700">No epic assigned</h2>
              <p className="text-xs text-slate-500 mt-0.5">{data.unassigned.totalTasks} task{data.unassigned.totalTasks !== 1 ? 's' : ''} without an epic</p>
            </div>
            <table className="w-full text-left bg-white">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2">Task</th>
                  <th className="px-3 py-2 w-16">Pri</th>
                  <th className="px-3 py-2">Sprint</th>
                  <th className="px-4 py-2 text-right w-16">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.unassigned.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
