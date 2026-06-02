'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSprint } from '@/lib/api/sprints';
import { getProject } from '@/lib/api/projects';
import { createTask, upsertAssignment } from '@/lib/api/tasks';
import { fetchBoard } from '@/lib/api/boards';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@sprintflow/ui';
import { Spinner } from '@sprintflow/ui';
import type { SprintDto } from '@sprintflow/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  projectId: string;
  onSuccess?: (sprint: SprintDto) => void;
}

type Priority = 'P0' | 'P1' | 'P2';

interface PendingTask {
  id: string; // local uuid for list key
  title: string;
  priority: Priority;
  memberId: string;
  hours: string;
}

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2'];

const PRIORITY_STYLES: Record<Priority, string> = {
  P0: 'bg-red-500 text-white',
  P1: 'bg-amber-400 text-white',
  P2: 'bg-slate-500 text-white',
};

function newTask(defaultMemberId = ''): PendingTask {
  return {
    id: Math.random().toString(36).slice(2),
    title: '',
    priority: 'P1',
    memberId: defaultMemberId,
    hours: '',
  };
}

// ─── Inline task row ──────────────────────────────────────────────────────────

function TaskRow({
  task,
  members,
  onChange,
  onRemove,
  autoFocus,
}: {
  task: PendingTask;
  members: Array<{ id: string; name: string }>;
  onChange: (updated: PendingTask) => void;
  onRemove: () => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 transition-all hover:border-slate-300 hover:bg-white">
      {/* Priority chips */}
      <div className="flex gap-0.5 flex-shrink-0">
        {PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange({ ...task, priority: p })}
            className={`rounded px-1.5 py-0.5 text-[9px] font-black transition-colors ${
              task.priority === p ? PRIORITY_STYLES[p] : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Title */}
      <input
        autoFocus={autoFocus}
        type="text"
        value={task.title}
        onChange={(e) => onChange({ ...task, title: e.target.value })}
        placeholder="Task title…"
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none"
      />

      {/* Owner */}
      {members.length > 0 && (
        <select
          value={task.memberId}
          onChange={(e) => onChange({ ...task, memberId: e.target.value })}
          className="flex-shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
        >
          <option value="">— Owner —</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}

      {/* Hours */}
      <input
        type="number"
        min="0"
        step="0.5"
        value={task.hours}
        onChange={(e) => onChange({ ...task, hours: e.target.value })}
        placeholder="hrs"
        className="w-14 flex-shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none"
      />

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 rounded-full p-1 text-slate-300 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function SprintCreateModal({ isOpen, onClose, workspaceId, projectId, onSuccess }: Props) {
  const queryClient = useQueryClient();

  // Sprint fields
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [days, setDays] = useState(6);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [releaseMilestone, setReleaseMilestone] = useState(false);
  const [releaseLabel, setReleaseLabel] = useState('');
  const [releaseDate, setReleaseDate] = useState('');

  // Task section
  const [showTasks, setShowTasks] = useState(false);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultBoardId = useAuthStore((s) => s.defaultBoardId) ?? '';

  // Fetch project members + epics (only when task section is expanded)
  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: !!projectId && showTasks,
    staleTime: 120_000,
  });

  // Fetch board columns to get the "todo" column id for new tasks
  const { data: boardData } = useQuery({
    queryKey: ['board-columns', defaultBoardId],
    queryFn: () => fetchBoard(defaultBoardId),
    enabled: !!defaultBoardId && showTasks,
    staleTime: 300_000,
  });

  const members = projectData?.project.members ?? [];
  const firstColumnId = boardData?.columns?.[0]?.id ?? '';

  if (!isOpen) return null;

  const resetForm = () => {
    setName('');
    setGoal('');
    setDays(6);
    setStartDate('');
    setEndDate('');
    setReleaseMilestone(false);
    setReleaseLabel('');
    setReleaseDate('');
    setShowTasks(false);
    setPendingTasks([]);
    setError(null);
  };

  const handleToggleTasks = () => {
    if (!showTasks && pendingTasks.length === 0) {
      setPendingTasks([newTask(members[0]?.id ?? '')]);
    }
    setShowTasks((v) => !v);
  };

  const updateTask = (id: string, updated: PendingTask) =>
    setPendingTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));

  const removeTask = (id: string) =>
    setPendingTasks((prev) => prev.filter((t) => t.id !== id));

  const addTaskRow = () =>
    setPendingTasks((prev) => [...prev, newTask(members[0]?.id ?? '')]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      // 1. Create the sprint
      const sprint = await createSprint(workspaceId, {
        projectId,
        name: name.trim(),
        goal: goal.trim() || undefined,
        days: Number(days),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        releaseMilestone,
        releaseLabel: releaseMilestone && releaseLabel.trim() ? releaseLabel.trim() : undefined,
        releaseDate: releaseMilestone && releaseDate ? new Date(releaseDate).toISOString() : undefined,
      });

      // 2. Create tasks sequentially (need sprint.id for each)
      const validTasks = pendingTasks.filter((t) => t.title.trim());
      if (validTasks.length > 0 && defaultBoardId && firstColumnId) {
        for (const pt of validTasks) {
          const task = await createTask({
            workspaceId,
            boardId: defaultBoardId,
            columnId: firstColumnId,
            title: pt.title.trim(),
            priority: pt.priority,
            sprintId: sprint.id,
            projectId: projectId || undefined,
          });

          const h = parseFloat(pt.hours);
          if (pt.memberId && !isNaN(h) && h > 0) {
            await upsertAssignment(task.id, workspaceId, pt.memberId, h);
          }
        }
      }

      // Invalidate queries so UI refreshes with new tasks & sprint
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      queryClient.invalidateQueries({ queryKey: ['project-overview'] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['my-work'] });
      if (defaultBoardId) {
        queryClient.invalidateQueries({ queryKey: ['board', defaultBoardId] });
      }

      onSuccess?.(sprint);
      resetForm();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to create sprint. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validTaskCount = pendingTasks.filter((t) => t.title.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 flex-shrink-0">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <svg className="h-5 w-5 text-indigo-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Create New Sprint
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          <form id="sprint-create-form" onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100 flex items-center gap-2">
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {error}
              </div>
            )}

            {/* Sprint Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Sprint Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Sprint 5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Sprint Goal */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Sprint Goal
              </label>
              <textarea
                placeholder="What are we trying to accomplish in this sprint?"
                rows={2}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>

            {/* Working Days */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Working Days
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            {/* Release Milestone */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <span className="text-sm font-medium text-slate-800 block">Release Milestone</span>
                  <span className="text-xs text-slate-400">Mark this sprint as carrying a customer release</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={releaseMilestone}
                    onChange={(e) => setReleaseMilestone(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>

              {releaseMilestone && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Release Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Release 1"
                      value={releaseLabel}
                      onChange={(e) => setReleaseLabel(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Release Date
                    </label>
                    <input
                      type="date"
                      value={releaseDate}
                      onChange={(e) => setReleaseDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Add Tasks section ─────────────────────────────────────────── */}
            <div className="rounded-xl border border-slate-200/80 overflow-hidden">
              {/* Section toggle header */}
              <button
                type="button"
                onClick={handleToggleTasks}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50/80 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 text-xs">
                    ＋
                  </span>
                  Add tasks to this sprint
                  {validTaskCount > 0 && (
                    <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-black text-white">
                      {validTaskCount}
                    </span>
                  )}
                </span>
                <svg
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showTasks ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Task list */}
              {showTasks && (
                <div className="border-t border-slate-100 bg-slate-50/30 px-4 py-4 space-y-2">
                  {/* Column hint */}
                  <div className="flex items-center gap-3 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 w-[4.5rem]">Priority</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex-1">Title</span>
                    {members.length > 0 && (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Owner</span>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 w-14 text-right">Hrs</span>
                    <span className="w-6" />
                  </div>

                  {pendingTasks.map((t, i) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      members={members}
                      onChange={(updated) => updateTask(t.id, updated)}
                      onRemove={() => removeTask(t.id)}
                      autoFocus={i === pendingTasks.length - 1 && i > 0}
                    />
                  ))}

                  <button
                    type="button"
                    onClick={addTaskRow}
                    className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400 hover:border-indigo-300 hover:bg-white hover:text-indigo-500 transition-all"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add another task
                  </button>

                  {!firstColumnId && defaultBoardId && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Board is loading… tasks will be created once ready.
                    </p>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 flex-shrink-0 bg-white">
          {validTaskCount > 0 ? (
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-indigo-600">{validTaskCount} task{validTaskCount !== 1 ? 's' : ''}</span> will be added after the sprint is created.
            </p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <Button
              type="submit"
              form="sprint-create-form"
              disabled={loading || !name.trim()}
              className="relative rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-violet-700 transition-all flex items-center justify-center min-w-[130px]"
            >
              {loading ? (
                <div className="flex items-center gap-1.5">
                  <Spinner className="h-4 w-4 text-white" />
                  {validTaskCount > 0 ? 'Creating…' : 'Creating…'}
                </div>
              ) : (
                validTaskCount > 0 ? `Create + ${validTaskCount} task${validTaskCount !== 1 ? 's' : ''}` : 'Create Sprint'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
