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

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedEpic, setSelectedEpic] = useState('');

  const promoteMutation = useMutation({
    mutationFn: ({ taskId, sprintId }: { taskId: string; sprintId: string }) =>
      updateTask(taskId, workspaceId, { sprintId, deferred: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
      setPromotingId(null);
    },
  });

  // Client-side calculations
  const totalEstimatedHours = tasks.reduce((sum, t) => sum + (t.totalHours || 0), 0);
  const blockedCount = tasks.filter((t) => t.blocked).length;
  const deferredCount = tasks.filter((t) => t.deferred).length;

  const uniqueEpics = Array.from(new Set(tasks.map((t) => t.epicName).filter(Boolean))) as string[];

  // Client-side filtering
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.epicName && t.epicName.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesPriority =
      !selectedPriority || t.priority === selectedPriority;
    const matchesEpic =
      !selectedEpic || t.epicName === selectedEpic;
    return matchesSearch && matchesPriority && matchesEpic;
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
    <div className="space-y-6">
      {/* Interactive Backlog Metrics Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Total Items */}
        <div className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-all duration-300">
          <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Backlog Tasks</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-800 tracking-tight">{tasks.length}</span>
            <span className="text-[10px] text-slate-400 font-medium">total</span>
          </div>
        </div>

        {/* Total Hours */}
        <div className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-all duration-300">
          <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Total Estimate</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-slate-800 tracking-tight">{totalEstimatedHours}h</span>
            <span className="text-[10px] text-slate-400 font-medium">estimated</span>
          </div>
        </div>

        {/* Blocked Count */}
        <div className={`group rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all duration-300 ${blockedCount > 0 ? 'border-rose-250 bg-rose-50/5' : 'border-slate-200/80 bg-white'}`}>
          <span className={`text-[9px] font-bold tracking-widest uppercase ${blockedCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>Blocked Items</span>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`text-2xl font-black tracking-tight ${blockedCount > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{blockedCount}</span>
            {blockedCount > 0 && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
          </div>
        </div>

        {/* Deferred Count */}
        <div className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-all duration-300">
          <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">Deferred Items</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-600 tracking-tight">{deferredCount}</span>
            <span className="text-[10px] text-slate-400 font-medium">parked</span>
          </div>
        </div>
      </div>

      {/* Main Table card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search by task title or epic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/80 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder-slate-400 text-slate-700 shadow-sm"
            />
          </div>

          {/* Priority filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="bg-white border border-slate-200/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-450 text-slate-600 shadow-sm cursor-pointer"
          >
            <option value="">All Priorities</option>
            <option value="P0">P0 - Must Ship</option>
            <option value="P1">P1 - Should Ship</option>
            <option value="P2">P2 - Nice to Have</option>
          </select>

          {/* Epic filter */}
          <select
            value={selectedEpic}
            onChange={(e) => setSelectedEpic(e.target.value)}
            className="bg-white border border-slate-200/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-450 text-slate-600 shadow-sm cursor-pointer max-w-[200px]"
          >
            <option value="">All Epics</option>
            {uniqueEpics.map((epic) => (
              <option key={epic} value={epic}>{epic}</option>
            ))}
          </select>
        </div>

        {/* Table structure */}
        <div className="overflow-x-auto">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              No tasks match your active filters.
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/40 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 select-none">
                  <th className="px-5 py-3.5">Task</th>
                  <th className="px-5 py-3.5">Epic</th>
                  <th className="px-5 py-3.5 text-right">Estimate</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Details / Reason Deferred</th>
                  <th className="px-5 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((t) => {
                  const epicColor = t.epicColor || '#6366f1';
                  return (
                    <tr 
                      key={t.id} 
                      className={`hover:bg-slate-50/40 transition-colors duration-150 relative ${
                        t.blocked 
                          ? 'bg-rose-50/15' 
                          : ''
                      }`}
                    >
                      {/* Left side glowing crimson blocker indicator ribbon */}
                      {t.blocked && (
                        <span className="absolute left-0 top-0 bottom-0 w-[3.5px] bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                      )}

                      {/* Title & Priority column */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          {t.priority && (
                            <span className={`rounded-md border px-2 py-0.5 text-[9px] font-extrabold tracking-wide uppercase ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                              {t.priority}
                            </span>
                          )}
                          <span className="font-bold text-slate-800 tracking-tight leading-snug">{t.title}</span>
                        </div>
                      </td>

                      {/* Epic matching ribbon tag column */}
                      <td className="px-5 py-4">
                        {t.epicName ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold border uppercase tracking-wider"
                            style={{
                              backgroundColor: epicColor + '12',
                              color: epicColor,
                              borderColor: epicColor + '30',
                            }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: epicColor }} />
                            <span>{t.epicName}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-50 border border-slate-200/50 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Estimate Hours Badge with clock icon */}
                      <td className="px-5 py-4 text-right font-mono font-bold">
                        {t.totalHours > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 px-2.5 py-0.5 rounded-lg text-slate-600 text-[10px]">
                            <svg className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{t.totalHours}h</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 font-bold">—</span>
                        )}
                      </td>

                      {/* Blocked Badge Column */}
                      <td className="px-5 py-4">
                        {t.blocked ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-100 px-2 py-0.5 text-[9px] font-extrabold text-rose-600 uppercase tracking-wide cursor-help select-none animate-pulse"
                            title={t.blockedReason || 'Blocked'}
                          >
                            🚫 Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-50 border border-slate-200/50 px-2 py-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                            Ready
                          </span>
                        )}
                      </td>

                      {/* Reason Column */}
                      <td className="max-w-xs px-5 py-4 text-slate-500 font-medium break-words leading-relaxed">
                        {t.blocked && t.blockedReason ? (
                          <span className="text-red-500 font-bold border-b border-dashed border-red-200" title={t.blockedReason}>
                            {t.blockedReason}
                          </span>
                        ) : (
                          t.deferredReason ?? (t.deferred ? <span className="rounded bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 tracking-wide uppercase">Deferred</span> : 'No sprint assigned')
                        )}
                      </td>

                      {/* Promo dropdown action column */}
                      <td className="px-5 py-4 text-center">
                        {promotingId === t.id ? (
                          <select
                            autoFocus
                            className="rounded-xl border border-indigo-300 px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white shadow-md cursor-pointer"
                            onChange={(e) => {
                              if (e.target.value) promoteMutation.mutate({ taskId: t.id, sprintId: e.target.value });
                            }}
                            onBlur={() => setPromotingId(null)}
                          >
                            <option value="">Promote to…</option>
                            {sprints.filter((s) => s.status !== 'COMPLETED').map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setPromotingId(t.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-500 hover:border-indigo-600 hover:text-white shadow-sm transition-all duration-200 active:scale-95"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Add to sprint</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
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
            Prioritization Hub
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Project Backlog</h1>
          <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
            Deferred items, unassigned user stories, and post-SPIKE tasks ready for prioritization.{' '}
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
