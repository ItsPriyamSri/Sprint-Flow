'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SprintBoardDto, SprintTaskDto, EpicDto } from '@sprintflow/shared';
import { updateTask } from '@/lib/api/tasks';
import { ScrumTaskDrawer } from './ScrumTaskDrawer';
import { InlineAddTask } from './InlineAddTask';

interface Props {
  board: SprintBoardDto;
  workspaceId: string;
  onRefresh: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 ring-red-200',
  P1: 'bg-amber-100 text-amber-700 ring-amber-200',
  P2: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function pct(a: number, b: number) {
  return b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;
}

function DayBurnDots({ hours, days }: { hours: number; days: number }) {
  const hoursPerDay = days > 0 ? hours / days : 0;
  const segments = Array.from({ length: Math.min(days, 6) }, (_, i) => {
    const dayNum = i + 1;
    return dayNum * hoursPerDay;
  });
  const max = Math.max(...segments, 0.1);
  return (
    <div className="flex items-end gap-0.5">
      {segments.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-sm bg-indigo-300 transition-all"
          style={{ height: `${Math.max(4, Math.round((h / max) * 14))}px` }}
          title={`Day ${i + 1}: ${h.toFixed(1)}h`}
        />
      ))}
    </div>
  );
}

function OwnerChips({ assignments }: { assignments: SprintTaskDto['assignments'] }) {
  if (!assignments.length) return <span className="text-xs text-slate-300">—</span>;
  return (
    <div className="flex items-center gap-1">
      {assignments.map((a) => (
        <span key={a.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-200 text-[7px] font-bold text-indigo-700">
            {a.memberName.slice(0, 2).toUpperCase()}
          </span>
          {a.hours}h
        </span>
      ))}
    </div>
  );
}

function TaskRow({
  task, sprintDays, onEdit, onDoneToggle,
}: {
  task: SprintTaskDto;
  sprintDays: number;
  onEdit: (id: string) => void;
  onDoneToggle: (id: string, done: boolean) => void;
}) {
  return (
    <tr
      className={`group border-t border-slate-100 hover:bg-slate-50/60 ${task.done ? 'opacity-60' : ''}`}
    >
      <td className="w-8 px-3 py-2.5">
        <input
          type="checkbox"
          checked={task.done}
          onChange={(e) => onDoneToggle(task.id, e.target.checked)}
          className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="w-12 px-2 py-2.5">
        {task.priority && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${PRIORITY_COLORS[task.priority] ?? ''}`}>
            {task.priority}
          </span>
        )}
      </td>
      <td className="px-2 py-2.5 cursor-pointer" onClick={() => onEdit(task.id)}>
        <span className={`text-sm text-slate-800 hover:text-indigo-700 ${task.done ? 'line-through text-slate-400' : ''}`}>
          {task.title}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <OwnerChips assignments={task.assignments} />
      </td>
      <td className="w-20 px-3 py-2.5 text-right font-mono text-xs text-slate-500">
        {task.totalHours > 0 ? `${task.totalHours}h` : '—'}
      </td>
      <td className="w-24 px-3 py-2.5">
        <DayBurnDots hours={task.totalHours} days={sprintDays} />
      </td>
    </tr>
  );
}

function EpicSection({
  epic, tasks, members, onEdit, onDoneToggle, sprintId, workspaceId, projectId, sprintDays, onTaskAdded,
}: {
  epic: EpicDto | null;
  tasks: SprintTaskDto[];
  members: SprintBoardDto['memberWorkload'];
  onEdit: (id: string) => void;
  onDoneToggle: (id: string, done: boolean) => void;
  sprintId: string;
  workspaceId: string;
  projectId: string | null;
  sprintDays: number;
  onTaskAdded: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Epic header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
      >
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
          style={{ backgroundColor: epic?.color ?? '#e2e8f0' }}
        />
        <span className="flex-1 text-left text-sm font-semibold text-slate-800">
          {epic?.name ?? 'No Epic'}
        </span>
        <span className="text-xs text-slate-400">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
        <svg
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <>
          <table className="w-full">
            <tbody>
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} sprintDays={sprintDays} onEdit={onEdit} onDoneToggle={onDoneToggle} />
              ))}
            </tbody>
          </table>

          {addingTask ? (
            <div className="border-t border-slate-100 px-4 py-2">
              <InlineAddTask
                sprintId={sprintId}
                epicId={epic?.id}
                workspaceId={workspaceId}
                projectId={projectId}
                members={members.map((mw) => mw.member)}
                onDone={() => { setAddingTask(false); onTaskAdded(); }}
                onCancel={() => setAddingTask(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingTask(true)}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-400 hover:bg-slate-50 hover:text-indigo-600"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add task
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function SprintBoardView({ board, workspaceId, onRefresh }: Props) {
  const queryClient = useQueryClient();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const doneMutation = useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      updateTask(taskId, workspaceId, { done }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sprint-board', board.sprint.id] });
    },
  });

  const handleDoneToggle = useCallback((taskId: string, done: boolean) => {
    doneMutation.mutate({ taskId, done });
  }, [doneMutation]);

  // Group tasks by epic
  const epicIds = [...new Set(board.tasks.map((t) => t.epicId))];
  const epicGroups: Array<{ epic: EpicDto | null; tasks: SprintTaskDto[] }> = epicIds.map((eid) => ({
    epic: eid ? (board.epics.find((e) => e.id === eid) ?? null) : null,
    tasks: board.tasks.filter((t) => t.epicId === eid),
  }));
  // Tasks without an epic
  const noEpicTasks = board.tasks.filter((t) => !t.epicId);
  if (noEpicTasks.length > 0 && !epicIds.includes(null)) {
    epicGroups.push({ epic: null, tasks: noEpicTasks });
  }

  const usedPct = pct(board.plannedHours, board.budgetHours);
  const isOver = board.plannedHours > board.budgetHours;

  const statusColors: Record<string, string> = {
    ACTIVE:    'bg-green-100 text-green-700',
    PLANNING:  'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Sprint header */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{board.sprint.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[board.sprint.status] ?? ''}`}>
                {board.sprint.status}
              </span>
              {board.sprint.releaseMilestone && (
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-600">
                  {board.sprint.releaseLabel ?? 'Release'}
                </span>
              )}
            </div>
            {board.sprint.goal && (
              <p className="mt-0.5 text-sm text-slate-500">{board.sprint.goal}</p>
            )}
            {(board.sprint.startDate || board.sprint.endDate) && (
              <p className="mt-0.5 text-xs text-slate-400">
                {board.sprint.startDate ? new Date(board.sprint.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '?'}
                {' → '}
                {board.sprint.endDate ? new Date(board.sprint.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}
                {' · '}{board.sprint.days} working days
              </p>
            )}
          </div>

          {/* Budget bar */}
          <div className="min-w-[200px]">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{board.plannedHours}h planned</span>
              <span>{board.budgetHours}h budget</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : usedPct > 85 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                style={{ width: `${Math.min(100, usedPct)}%` }}
              />
            </div>
            <p className={`mt-1 text-right text-xs font-medium ${isOver ? 'text-red-600' : 'text-emerald-600'}`}>
              {isOver ? `${board.plannedHours - board.budgetHours}h over` : `${board.bufferHours}h buffer`}
            </p>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex-shrink-0 border-b border-slate-100 bg-slate-50 px-6">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-8 py-2 px-3" />
              <th className="w-12 px-2 py-2">Pri</th>
              <th className="px-2 py-2">Task</th>
              <th className="px-3 py-2">Owner</th>
              <th className="w-20 px-3 py-2 text-right">Hours</th>
              <th className="w-24 px-3 py-2">Burn</th>
            </tr>
          </thead>
        </table>
      </div>

      {/* Epic sections */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {epicGroups.map(({ epic, tasks }) => (
          <EpicSection
            key={epic?.id ?? '__no_epic__'}
            epic={epic}
            tasks={tasks}
            members={board.memberWorkload}
            onEdit={setActiveTaskId}
            onDoneToggle={handleDoneToggle}
            sprintId={board.sprint.id}
            workspaceId={workspaceId}
            projectId={board.sprint.projectId}
            sprintDays={board.sprint.days}
            onTaskAdded={onRefresh}
          />
        ))}

        {epicGroups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-slate-400">No tasks in this sprint yet.</p>
            <p className="mt-1 text-xs text-slate-300">Add tasks using the "+ Add task" button below each epic.</p>
          </div>
        )}
      </div>

      {/* Task detail drawer */}
      {activeTaskId && (
        <ScrumTaskDrawer
          taskId={activeTaskId}
          workspaceId={workspaceId}
          members={board.memberWorkload.map((mw) => mw.member)}
          epics={board.epics}
          onClose={() => setActiveTaskId(null)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}
