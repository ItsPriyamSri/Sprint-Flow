'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getBacklog } from '@/lib/api/projects';
import { updateTask } from '@/lib/api/tasks';
import { useAuthStore } from '@/store/auth.store';
import type { SprintTaskDto, SprintDto } from '@sprintflow/shared';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-50 text-red-700 border-red-200/60',
  P1: 'bg-amber-50 text-amber-700 border-amber-200/60',
  P2: 'bg-slate-50 text-slate-600 border-slate-200/60',
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
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 border border-slate-100">
          <svg className="h-7 w-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="text-sm font-bold text-slate-700 mt-1">Backlog is empty</p>
        <p className="text-xs text-slate-400 max-w-xs leading-normal">Deferred tasks and tasks without an assigned sprint will appear here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/60 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 select-none">
              <th className="px-4 py-3.5">Task</th>
              <th className="px-4 py-3.5">Epic</th>
              <th className="px-4 py-3.5 text-right">Hours</th>
              <th className="px-4 py-3.5">Blocked</th>
              <th className="px-4 py-3.5">Reason deferred</th>
              <th className="px-4 py-3.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <tr 
                key={t.id} 
                className={`hover:bg-slate-50/40 transition-colors duration-150 relative ${
                  t.blocked 
                    ? 'bg-rose-50/15' 
                    : ''
                }`}
              >
                {/* Visual red vertical marker for blocked tasks */}
                {t.blocked && (
                  <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                )}

                <td className="px-4 py-4.5">
                  <div className="flex items-center gap-2.5">
                    {t.priority && (
                      <span className={`rounded-md border px-2 py-0.5 text-[9px] font-extrabold tracking-wide uppercase ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                        {t.priority}
                      </span>
                    )}
                    <span className="font-bold text-slate-800 tracking-tight leading-snug">{t.title}</span>
                  </div>
                </td>
                
                <td className="px-4 py-4.5 text-slate-500 font-medium">{t.epicName ?? '—'}</td>
                
                <td className="px-4 py-4.5 text-right font-mono font-bold text-slate-500">
                  {t.totalHours > 0 ? (
                    <span className="bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md text-slate-600">
                      {t.totalHours}h
                    </span>
                  ) : '—'}
                </td>
                
                <td className="px-4 py-4.5">
                  {t.blocked ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600 uppercase tracking-wide cursor-help select-none animate-pulse"
                      title={t.blockedReason || 'Blocked'}
                    >
                      🚫 Blocked
                    </span>
                  ) : (
                    <span className="text-slate-300 font-bold">—</span>
                  )}
                </td>
                
                <td className="max-w-xs px-4 py-4.5 text-slate-500 font-medium break-words leading-relaxed">
                  {t.blocked && t.blockedReason ? (
                    <span className="text-red-500 font-bold border-b border-dashed border-red-200" title={t.blockedReason}>
                      {t.blockedReason}
                    </span>
                  ) : (
                    t.deferredReason ?? (t.deferred ? <span className="rounded bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 tracking-wide uppercase">Deferred</span> : 'No sprint assigned')
                  )}
                </td>
                
                <td className="px-4 py-4.5 text-center">
                  {promotingId === t.id ? (
                    <select
                      autoFocus
                      className="rounded-xl border border-indigo-300 px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white shadow-sm cursor-pointer"
                      onChange={(e) => {
                        if (e.target.value) promoteMutation.mutate({ taskId: t.id, sprintId: e.target.value });
                      }}
                      onBlur={() => setPromotingId(null)}
                    >
                      <option value="">Choose Sprint…</option>
                      {sprints.filter((s) => s.status !== 'COMPLETED').map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setPromotingId(t.id)}
                      className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 shadow-sm transition-all duration-200 active:scale-95"
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
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md border border-slate-200/60 mb-4 animate-bounce">
          <span className="text-2xl">📁</span>
        </div>
        <p className="text-base font-bold text-slate-800">No active project selected</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">Select a project in the sidebar switcher to view backlog.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* Premium Header Banner */}
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-50/30 blur-3xl" />
        
        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            Deferred Items
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Project Backlog</h1>
          <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
            Deferred issues and tasks awaiting sprint prioritization.{' '}
            {data && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-600 text-[10px] border border-indigo-100/50 ml-1 inline-block">
                {data.data.length} task{data.data.length !== 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex-1 px-8 py-8 max-w-[1400px] w-full mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500 border border-red-150 mb-3">
              <span className="text-lg">⚠️</span>
            </div>
            <p className="text-sm font-bold text-slate-800">Failed to load project backlog</p>
            <p className="text-xs text-slate-400 mt-1">Please try refreshing or choosing a different project.</p>
          </div>
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
