'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTask, updateTask, deleteTask, createComment, type TaskDetail } from '@/lib/api/tasks';
import { useAuthStore } from '@/store/auth.store';
import { confirm } from '@/store/confirm.store';
import { ApiError } from '@/lib/api/client';
import { getActivity, describeActivity, timeAgo } from '@/lib/api/activity';
import { getMyWorkspace } from '@/lib/api/workspaces';
import { listWorkspaceUsers } from '@/lib/api/users';
import { useBoardStore } from '@/store/board.store';
import {
  boardQueryKey,
  columnLabelForTask,
  fetchBoard,
  syncTaskInBoardCache,
  updateBoardCache,
} from '@/lib/api/boards';

const PRIORITY_OPTIONS = [
  { value: '',         label: '— None —' },
  { value: 'LOW',      label: 'Low' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'HIGH',     label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'text-slate-500', MEDIUM: 'text-blue-600', HIGH: 'text-orange-600', CRITICAL: 'text-red-600',
};

const ACTION_ICONS: Record<string, string> = {
  TASK_CREATED: '✨', TASK_UPDATED: '✏️', TASK_MOVED: '➡️',
  TASK_DELETED: '🗑', TASK_COMMENTED: '💬',
};

interface FormState {
  title: string;
  description: string;
  notes: string;
  priority: string;
  externalId: string;
  hoursN: string;
  hoursI: string;
  hoursTotal: string;
  sprintId: string;
  epicId: string;
  assigneeId: string;
}

function emptyForm(): FormState {
  return {
    title: '', description: '', notes: '', priority: '', externalId: '',
    hoursN: '', hoursI: '', hoursTotal: '',
    sprintId: '', epicId: '', assigneeId: '',
  };
}

function taskToForm(task: NonNullable<Awaited<ReturnType<typeof getTask>>>): FormState {
  return {
    title: task.title,
    description: task.description ?? '',
    notes: task.notes ?? '',
    priority: task.priority ?? '',
    externalId: task.externalId ?? '',
    hoursN: task.hoursN != null ? String(task.hoursN) : '',
    hoursI: task.hoursI != null ? String(task.hoursI) : '',
    hoursTotal: task.hoursTotal != null ? String(task.hoursTotal) : '',
    sprintId: task.sprintId ?? '',
    epicId: task.epicId ?? '',
    assigneeId: task.assigneeId ?? '',
  };
}

function parseHours(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  boardId: string;
  workspaceId: string;
}

export function TaskDetailDrawer({ boardId, workspaceId }: Props) {
  const { activeTaskId, closeTask } = useBoardStore();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [mounted, setMounted] = useState(false);
  const formInitForTask = useRef<string | null>(null);
  const authWorkspaceId = useAuthStore((s) => s.defaultWorkspaceId);

  const wsId = workspaceId || authWorkspaceId || '';

  useEffect(() => setMounted(true), []);

  const { data: board } = useQuery({
    queryKey: boardQueryKey(boardId),
    queryFn: () => fetchBoard(boardId),
    enabled: !!boardId && !!activeTaskId,
    staleTime: 5_000,
  });

  const { data: task, isLoading, isError: taskError } = useQuery({
    queryKey: ['task', activeTaskId, wsId],
    queryFn: () => getTask(activeTaskId!, wsId),
    enabled: !!activeTaskId && !!wsId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: getMyWorkspace,
    staleTime: 60_000,
  });

  const { data: usersResult } = useQuery({
    queryKey: ['users', wsId],
    queryFn: () => listWorkspaceUsers(wsId),
    enabled: !!wsId,
    staleTime: 60_000,
  });

  const { data: activityResult } = useQuery({
    queryKey: ['task-activity', activeTaskId, wsId],
    queryFn: () => getActivity(wsId, { entityId: activeTaskId!, limit: 15 }),
    enabled: !!activeTaskId && !!wsId,
    staleTime: 30_000,
  });

  // Load server data once per opened task — do not reset while the user is editing
  useEffect(() => {
    if (!activeTaskId) {
      formInitForTask.current = null;
      setSaved(false);
      setSaveError(null);
      return;
    }
    if (!task || task.id !== activeTaskId) return;
    if (formInitForTask.current === activeTaskId) return;
    formInitForTask.current = activeTaskId;
    setForm(taskToForm(task));
    setSaved(false);
    setSaveError(null);
  }, [activeTaskId, task]);

  const listName = (() => {
    if (!task) return '';
    const fromBoard = board?.columns.flatMap((c) => c.tasks).find((t) => t.id === task.id);
    if (fromBoard && board) return columnLabelForTask(board, fromBoard);
    return task.column?.name ?? '';
  })();

  const updateMutation = useMutation({
    mutationFn: ({
      taskId,
      workspaceId,
      patch,
    }: {
      taskId: string;
      workspaceId: string;
      patch: Parameters<typeof updateTask>[2];
    }) => updateTask(taskId, workspaceId, patch),
    onSuccess: (updated: TaskDetail) => {
      setSaved(true);
      setSaveError(null);
      setForm(taskToForm(updated));
      formInitForTask.current = updated.id;
      queryClient.setQueryData(['task', updated.id, wsId], updated);
      syncTaskInBoardCache(queryClient, boardId, updated);
      queryClient.invalidateQueries({ queryKey: ['task-activity', updated.id, wsId] });
      window.setTimeout(() => closeTask(), 550);
    },
    onError: (err: Error) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err.message || 'Failed to save changes';
      setSaveError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(activeTaskId!, wsId),
    onSuccess: () => {
      updateBoardCache(queryClient, boardId, (old) => ({
        ...old,
        columns: old.columns.map((col) => ({
          ...col,
          tasks: col.tasks.filter((t) => t.id !== activeTaskId),
        })),
      }));
      closeTask();
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => createComment(activeTaskId!, wsId, comment),
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['task', activeTaskId, wsId] });
      queryClient.invalidateQueries({ queryKey: ['task-activity', activeTaskId, wsId] });
    },
  });

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    const taskId = activeTaskId;
    const workspaceId =
      wsId ||
      board?.workspaceId ||
      useAuthStore.getState().defaultWorkspaceId ||
      '';

    if (!taskId || !workspaceId) {
      setSaveError('Workspace not loaded — refresh the page and try again.');
      return;
    }
    if (!form.title.trim()) return;

    setSaveError(null);
    updateMutation.mutate({
      taskId,
      workspaceId,
      patch: {
        title: form.title.trim(),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        priority: form.priority
          ? (form.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
          : null,
        externalId: form.externalId.trim() || null,
        hoursN: parseHours(form.hoursN),
        hoursI: parseHours(form.hoursI),
        hoursTotal: parseHours(form.hoursTotal),
        sprintId: form.sprintId || null,
        epicId: form.epicId || null,
        assigneeId: form.assigneeId || null,
      },
    });
  };

  if (!activeTaskId || !mounted) return null;

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400';
  const labelCls = 'block text-xs font-medium text-slate-500';

  const drawer = (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={closeTask} aria-hidden />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Edit task"
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {listName && (
              <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
                {listName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: 'Delete task?',
                  message: 'This task will be permanently removed. This action cannot be undone.',
                  confirmLabel: 'Delete task',
                  variant: 'danger',
                });
                if (ok) deleteMutation.mutate();
              }}
              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
              title="Delete task"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button onClick={closeTask} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : taskError || !task ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-slate-500">Could not load this task.</p>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          </div>
        ) : (
          <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSave}>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              <div>
                <label className={labelCls}>Title</label>
                <textarea
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  rows={2}
                  className={`${inputCls} font-medium`}
                />
              </div>

              <div>
                <label className={labelCls}>Task ID</label>
                <input
                  value={form.externalId}
                  onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))}
                  placeholder="e.g. 0.7"
                  className={`${inputCls} font-mono`}
                />
              </div>

              <div>
                <label className={labelCls}>Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className={`${inputCls} ${PRIORITY_COLOR[form.priority] ?? 'text-slate-500'}`}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>List</label>
                <p className="mt-1 text-sm text-slate-600">
                  {listName || '—'}
                  <span className="ml-2 text-xs text-slate-400">(drag card to change)</span>
                </p>
              </div>

              <div>
                <label className={labelCls}>Sprint</label>
                <select
                  value={form.sprintId}
                  onChange={(e) => setForm((f) => ({ ...f, sprintId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— No sprint —</option>
                  {workspace?.sprints.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Epic</label>
                <select
                  value={form.epicId}
                  onChange={(e) => setForm((f) => ({ ...f, epicId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— No epic —</option>
                  {workspace?.epics.map((ep) => (
                    <option key={ep.id} value={ep.id}>{ep.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Owner</label>
                <select
                  value={form.assigneeId}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">— Unassigned —</option>
                  {usersResult?.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.status === 'UNCLAIMED' ? ' (unclaimed)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Hours</label>
                <div className="mt-1 grid grid-cols-3 gap-3">
                  {(['hoursN', 'hoursI', 'hoursTotal'] as const).map((key, i) => (
                    <div key={key}>
                      <span className="text-[10px] text-slate-400">
                        {['Hrs (N)', 'Hrs (I)', 'Total'][i]}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Add a description…"
                  className={`${inputCls} resize-none`}
                />
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Add notes…"
                  className={`${inputCls} resize-none`}
                />
              </div>

              {task.comments.length > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-medium text-slate-500">Comments</h3>
                  <div className="space-y-3">
                    {task.comments.map((c) => (
                      <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                            {c.author.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-slate-700">{c.author.name}</span>
                          <span className="text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-600">{c.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Add comment</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="Write a comment…"
                  className={`${inputCls} resize-none`}
                />
                <button
                  onClick={() => { if (comment.trim()) commentMutation.mutate(); }}
                  disabled={!comment.trim() || commentMutation.isPending}
                  className="mt-1.5 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >
                  {commentMutation.isPending ? 'Posting…' : 'Post comment'}
                </button>
              </div>

              {activityResult && activityResult.data.length > 0 && (
                <div>
                  <h3 className="mb-3 text-xs font-medium text-slate-500">Activity</h3>
                  <ol className="space-y-2.5">
                    {activityResult.data.map((entry) => (
                      <li key={entry.id} className="flex items-start gap-2.5 text-xs text-slate-500">
                        <span className="mt-0.5 flex-shrink-0" aria-hidden>{ACTION_ICONS[entry.action] ?? '•'}</span>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-700">{entry.actor.name} </span>
                          {describeActivity(entry)}
                        </div>
                        <span className="flex-shrink-0 text-slate-400">{timeAgo(entry.createdAt)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t border-slate-100 bg-white px-6 py-4">
              {saveError && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {saveError}
                </p>
              )}
              <button
                type="submit"
                disabled={updateMutation.isPending || saved || !form.title.trim()}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                  saved
                    ? 'bg-green-600 hover:bg-green-600'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {updateMutation.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </aside>
    </>
  );

  return createPortal(drawer, document.body);
}
