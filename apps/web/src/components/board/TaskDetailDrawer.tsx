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
  { value: '',   label: '— None —' },
  { value: 'P0', label: 'P0 — Must ship' },
  { value: 'P1', label: 'P1 — Should ship' },
  { value: 'P2', label: 'P2 — Nice to have' },
];

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'text-red-600', P1: 'text-amber-600', P2: 'text-slate-500',
};

const ACTION_ICONS: Record<string, string> = {
  TASK_CREATED: '✨', TASK_UPDATED: '✏️', TASK_MOVED: '➡️',
  TASK_DELETED: '🗑', TASK_COMMENTED: '💬', TASK_BLOCKED: '🚫', TASK_UNBLOCKED: '✅',
};

function CommentItem({
  comment, taskId, workspaceId, currentUser, onRefresh
}: {
  comment: TaskDetail['comments'][number];
  taskId: string;
  workspaceId: string;
  currentUser: { id: string } | null;
  onRefresh: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const queryClient = useQueryClient();

  const editMutation = useMutation({
    mutationFn: (body: string) => import('@/lib/api/tasks').then(api => api.updateComment(taskId, comment.id, workspaceId, body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId, workspaceId] });
      onRefresh();
      setIsEditing(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => import('@/lib/api/tasks').then(api => api.deleteComment(taskId, comment.id, workspaceId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId, workspaceId] });
      onRefresh();
    }
  });

  const isAuthor = currentUser && comment.author.id === currentUser.id;

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 relative group border border-slate-100 hover:border-slate-200 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
            {comment.author.name.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-slate-700">{comment.author.name}</span>
          <span className="text-[10px] text-slate-400">{timeAgo(comment.createdAt)}</span>
        </div>
        
        {isAuthor && !isEditing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity">
            <button
              onClick={() => { setIsEditing(true); setEditBody(comment.body); }}
              className="text-[10px] text-slate-400 hover:text-indigo-650 hover:text-indigo-600 font-semibold"
            >
              Edit
            </button>
            <span className="text-[10px] text-slate-300">•</span>
            <button
              onClick={() => {
                if (window.confirm('Delete comment? This cannot be undone.')) {
                  deleteMutation.mutate();
                }
              }}
              className="text-[10px] text-slate-400 hover:text-red-600 font-semibold"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={2}
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none bg-white resize-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setIsEditing(false)}
              className="rounded px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (editBody.trim() && editBody !== comment.body) editMutation.mutate(editBody.trim()); }}
              disabled={!editBody.trim() || editBody === comment.body || editMutation.isPending}
              className="rounded bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
      )}
    </div>
  );
}

interface FormState {
  title: string;
  description: string;
  notes: string;
  priority: string;
  externalId: string;
  sprintId: string;
  epicId: string;
  blocked: boolean;
  blockedReason: string;
}

function emptyForm(): FormState {
  return {
    title: '', description: '', notes: '', priority: '', externalId: '',
    sprintId: '', epicId: '', blocked: false, blockedReason: '',
  };
}

function taskToForm(task: NonNullable<Awaited<ReturnType<typeof getTask>>>): FormState {
  return {
    title: task.title,
    description: task.description ?? '',
    notes: task.notes ?? '',
    priority: task.priority ?? '',
    externalId: task.externalId ?? '',
    sprintId: task.sprintId ?? '',
    epicId: task.epicId ?? '',
    blocked: task.blocked,
    blockedReason: task.blockedReason ?? '',
  };
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
  const user = useAuthStore((s) => s.user);

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
      queryClient.invalidateQueries({ queryKey: ['project-overview'] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['my-work'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
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
      queryClient.invalidateQueries({ queryKey: ['project-overview'] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      queryClient.invalidateQueries({ queryKey: ['backlog'] });
      queryClient.invalidateQueries({ queryKey: ['my-work'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
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
          ? (form.priority as 'P0' | 'P1' | 'P2')
          : null,
        externalId: form.externalId.trim() || null,
        sprintId: form.sprintId || null,
        epicId: form.epicId || null,
        blocked: form.blocked,
        blockedReason: form.blocked ? form.blockedReason.trim() || null : null,
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

              {/* Blocked Status */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">Blocked Status</span>
                    <span className="text-[11px] text-slate-400">Mark this task as blocked / impeded</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={form.blocked}
                      onChange={(e) => setForm(f => ({ ...f, blocked: e.target.checked }))}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-650 peer-checked:bg-red-600" />
                  </label>
                </div>

                {form.blocked && (
                  <div className="mt-3 animate-fadeIn">
                    <label className={labelCls}>Reason for Block *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Waiting on API deployment"
                      value={form.blockedReason}
                      onChange={(e) => setForm(f => ({ ...f, blockedReason: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              {task && task.assignments && task.assignments.length > 0 && (
                <div>
                  <label className={labelCls}>Assignments</label>
                  <div className="mt-1 space-y-1">
                    {task.assignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
                        <span className="font-medium text-slate-700">{a.memberName}</span>
                        <span className="font-mono text-slate-500">{a.hours}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                      <CommentItem
                        key={c.id}
                        comment={c}
                        taskId={task.id}
                        workspaceId={wsId}
                        currentUser={user}
                        onRefresh={() => {}}
                      />
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
