'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTask, updateTask, upsertAssignment, removeAssignment, createComment, type TaskDetail } from '@/lib/api/tasks';
import type { ProjectMemberDto, EpicDto } from '@sprintflow/shared';
import { confirm } from '@/store/confirm.store';
import { useAuthStore } from '@/store/auth.store';
import { timeAgo } from '@/lib/api/activity';

interface Props {
  taskId: string;
  workspaceId: string;
  members: ProjectMemberDto[];
  epics: EpicDto[];
  onClose: () => void;
  onSaved: () => void;
}

const PRIORITY_OPTIONS = [
  { value: '', label: '— None —' },
  { value: 'P0', label: 'P0 — Launch-blocking' },
  { value: 'P1', label: 'P1 — Should-ship' },
  { value: 'P2', label: 'P2 — Nice-to-have' },
];

function CommentItem({
  comment,
  taskId,
  workspaceId,
  currentUser,
  onRefresh,
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
    mutationFn: (body: string) =>
      import('@/lib/api/tasks').then((api) =>
        api.updateComment(taskId, comment.id, workspaceId, body)
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', taskId, workspaceId] });
      onRefresh();
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      import('@/lib/api/tasks').then((api) =>
        api.deleteComment(taskId, comment.id, workspaceId)
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', taskId, workspaceId] });
      onRefresh();
    },
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
              onClick={() => {
                setIsEditing(true);
                setEditBody(comment.body);
              }}
              className="text-[10px] text-slate-400 hover:text-indigo-600 font-semibold"
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
              onClick={() => {
                if (editBody.trim() && editBody !== comment.body)
                  editMutation.mutate(editBody.trim());
              }}
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

export function ScrumTaskDrawer({ taskId, workspaceId, members, epics, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({
    title: '',
    description: '',
    notes: '',
    priority: '',
    epicId: '',
    done: false,
    blocked: false,
    blockedReason: '',
    deferred: false,
    deferredReason: '',
  });
  const initRef = useRef(false);

  useEffect(() => setMounted(true), []);

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId, workspaceId],
    queryFn: () => getTask(taskId, workspaceId),
    enabled: !!taskId && !!workspaceId,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!task || initRef.current) return;
    initRef.current = true;
    setForm({
      title: task.title,
      description: task.description ?? '',
      notes: task.notes ?? '',
      priority: task.priority ?? '',
      epicId: task.epicId ?? '',
      done: task.done,
      blocked: task.blocked,
      blockedReason: task.blockedReason ?? '',
      deferred: task.deferred,
      deferredReason: task.deferredReason ?? '',
    });
  }, [task]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateTask(taskId, workspaceId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        priority: (form.priority as 'P0' | 'P1' | 'P2' | null) || null,
        epicId: form.epicId || null,
        done: form.done,
        blocked: form.blocked,
        blockedReason: form.blocked ? form.blockedReason.trim() || null : null,
        deferred: form.deferred,
        deferredReason: form.deferredReason.trim() || null,
      }),
    onSuccess: () => {
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      void queryClient.invalidateQueries({ queryKey: ['project-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
      void queryClient.invalidateQueries({ queryKey: ['backlog'] });
      void queryClient.invalidateQueries({ queryKey: ['my-work'] });
      void queryClient.invalidateQueries({ queryKey: ['workspace'] });
      onSaved();
      setTimeout(onClose, 550);
    },
    onError: (e: Error) => setSaveError(e.message),
  });

  const commentMutation = useMutation({
    mutationFn: () => createComment(taskId, workspaceId, comment),
    onSuccess: () => {
      setComment('');
      void queryClient.invalidateQueries({ queryKey: ['task', taskId, workspaceId] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ memberId, hours, actualHours }: { memberId: string; hours: number; actualHours?: number | null }) =>
      upsertAssignment(taskId, workspaceId, memberId, hours, actualHours),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', taskId, workspaceId] });
      onSaved();
    },
  });

  const removeAssignMutation = useMutation({
    mutationFn: (memberId: string) => removeAssignment(taskId, workspaceId, memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task', taskId, workspaceId] });
      onSaved();
    },
  });

  if (!mounted) return null;

  const inputCls =
    'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400';
  const labelCls = 'block text-xs font-medium text-slate-500';

  const drawer = (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <span className="text-sm font-medium text-slate-500">Task Detail</span>
          <button onClick={onClose} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : (
          <form
            className="flex flex-1 flex-col overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
          >
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              {/* Done toggle */}
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:border-indigo-200">
                <input
                  type="checkbox"
                  checked={form.done}
                  onChange={(e) => setForm((f) => ({ ...f, done: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                />
                <span className="text-sm font-medium text-slate-700">Mark as done</span>
              </label>

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
                <label className={labelCls}>Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className={inputCls}
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
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
                  {epics.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Assignments */}
              <div>
                <div className="flex items-center justify-between">
                  <label className={labelCls}>Assignments</label>
                  <div className="flex gap-4 text-[10px] font-medium text-slate-400 pr-1">
                    <span>Planned</span>
                    <span>Actual</span>
                  </div>
                </div>
                <div className="mt-1.5 space-y-2">
                  {members.map((m) => {
                    const existing = task?.assignments.find((a) => a.projectMemberId === m.id);
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="flex-1 text-sm text-slate-700">{m.name}</span>
                        <input
                          type="number"
                          min="0"
                          max="200"
                          step="0.5"
                          defaultValue={existing?.hours ?? ''}
                          placeholder="0"
                          onBlur={(e) => {
                            const h = parseFloat(e.target.value);
                            const actualInput = e.currentTarget.closest('div')?.querySelector<HTMLInputElement>('[data-actual]');
                            const actual = actualInput ? parseFloat(actualInput.value) : NaN;
                            if (!isNaN(h) && h > 0) {
                              assignMutation.mutate({ memberId: m.id, hours: h, actualHours: !isNaN(actual) ? actual : existing?.actualHours ?? undefined });
                            } else if (existing && (e.target.value === '' || h === 0)) {
                              removeAssignMutation.mutate(m.id);
                            }
                          }}
                          className="w-14 rounded border border-slate-200 px-2 py-1 text-right text-sm focus:border-indigo-400 focus:outline-none"
                        />
                        <input
                          data-actual=""
                          type="number"
                          min="0"
                          max="200"
                          step="0.5"
                          defaultValue={existing?.actualHours ?? ''}
                          placeholder="—"
                          onBlur={(e) => {
                            const actual = parseFloat(e.target.value);
                            const plannedInput = e.currentTarget.closest('div')?.querySelector<HTMLInputElement>(':not([data-actual])[type="number"]');
                            const h = plannedInput ? parseFloat(plannedInput.value) : NaN;
                            const effectiveH = !isNaN(h) && h > 0 ? h : existing?.hours;
                            if (effectiveH && effectiveH > 0) {
                              assignMutation.mutate({ memberId: m.id, hours: effectiveH, actualHours: !isNaN(actual) ? actual : null });
                            }
                          }}
                          className="w-14 rounded border border-emerald-200 px-2 py-1 text-right text-sm focus:border-emerald-400 focus:outline-none"
                        />
                        <span className="text-xs text-slate-400">hrs</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Blocked Status */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                      Blocked Status
                    </span>
                    <span className="text-[11px] text-slate-400">Mark this task as blocked / impeded</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.blocked}
                      onChange={(e) => setForm((f) => ({ ...f, blocked: e.target.checked }))}
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
                      onChange={(e) => setForm((f) => ({ ...f, blockedReason: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                )}
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

              {/* Deferred */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.deferred}
                    onChange={(e) => setForm((f) => ({ ...f, deferred: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-amber-500"
                  />
                  <span className="text-xs font-medium text-slate-600">Deferred to backlog</span>
                </label>
                {form.deferred && (
                  <input
                    type="text"
                    value={form.deferredReason}
                    onChange={(e) => setForm((f) => ({ ...f, deferredReason: e.target.value }))}
                    placeholder="Reason for deferral…"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                )}
              </div>

              {/* Comments */}
              {task && task.comments.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-500">Comments</h3>
                  <div className="space-y-3">
                    {task.comments.map((c) => (
                      <CommentItem
                        key={c.id}
                        comment={c}
                        taskId={task.id}
                        workspaceId={workspaceId}
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
                  type="button"
                  onClick={() => {
                    if (comment.trim()) commentMutation.mutate();
                  }}
                  disabled={!comment.trim() || commentMutation.isPending}
                  className="mt-1 rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                >
                  Post
                </button>
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-slate-100 bg-white px-6 py-4">
              {saveError && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
              )}
              <button
                type="submit"
                disabled={saveMutation.isPending || saved || !form.title.trim()}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  saved ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {saveMutation.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </aside>
    </>
  );

  return createPortal(drawer, document.body);
}
