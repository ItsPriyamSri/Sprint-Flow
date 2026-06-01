'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getBacklog } from '@/lib/api/projects';
import { updateTask } from '@/lib/api/tasks';
import { useAuthStore } from '@/store/auth.store';
import type { SprintTaskDto, SprintDto } from '@sprintflow/shared';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-500',
};

function BacklogContent({
  tasks,
  sprints,
  workspaceId,
  projectId,
}: {
  tasks: SprintTaskDto[];
  sprints: SprintDto[];
  workspaceId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const promoteMutation = useMutation({
    mutationFn: ({ taskId, sprintId }: { taskId: string; sprintId: string }) =>
      updateTask(taskId, workspaceId, { sprintId, deferred: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
      setPromotingId(null);
    },
  });

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
          <svg className="h-7 w-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">Backlog is empty</p>
        <p className="text-xs text-slate-300">Tasks without a sprint or marked as deferred will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-2.5 text-left">Task</th>
            <th className="px-4 py-2.5 text-left">Epic</th>
            <th className="px-4 py-2.5 text-right">Hours</th>
            <th className="px-4 py-2.5 text-left">Reason deferred</th>
            <th className="px-4 py-2.5 text-center">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tasks.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50/50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {t.priority && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                      {t.priority}
                    </span>
                  )}
                  <span className="font-medium text-slate-800">{t.title}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-500">{t.epicName ?? '—'}</td>
              <td className="px-4 py-3 text-right font-mono text-slate-500">
                {t.totalHours > 0 ? `${t.totalHours}h` : '—'}
              </td>
              <td className="max-w-xs px-4 py-3 text-xs text-slate-400">
                {t.deferredReason ?? (t.deferred ? 'Deferred' : 'No sprint assigned')}
              </td>
              <td className="px-4 py-3 text-center">
                {promotingId === t.id ? (
                  <select
                    autoFocus
                    className="rounded-lg border border-indigo-300 px-2 py-1 text-xs focus:outline-none"
                    onChange={(e) => {
                      if (e.target.value) promoteMutation.mutate({ taskId: t.id, sprintId: e.target.value });
                    }}
                    onBlur={() => setPromotingId(null)}
                  >
                    <option value="">Pick sprint…</option>
                    {sprints.filter((s) => s.status !== 'COMPLETED').map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setPromotingId(t.id)}
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                  >
                    Add to sprint
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BacklogPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) => s.activeProject);
  const workspaceId = useAuthStore((s) => s.defaultWorkspaceId) ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['backlog', activeProjectId],
    queryFn: () => getBacklog(activeProjectId!),
    enabled: !!activeProjectId,
    staleTime: 15_000,
  });

  const sprints = activeProject?.sprints ?? [];

  if (!activeProjectId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        Select a project.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Backlog</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Deferred tasks and tasks without a sprint.
              {data && ` ${data.data.length} item${data.data.length !== 1 ? 's' : ''}.`}
            </p>
          </div>
        </div>
      </div>
      <div className="flex-1 px-6 py-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : isError ? (
          <div className="text-center text-sm text-slate-400">Failed to load backlog.</div>
        ) : (
          <BacklogContent
            tasks={data?.data ?? []}
            sprints={sprints}
            workspaceId={workspaceId}
            projectId={activeProjectId}
          />
        )}
      </div>
    </div>
  );
}
