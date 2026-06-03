'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getProjectDashboard } from '@/lib/api/projects';
import Link from 'next/link';

function getProgressColor(pct: number): string {
  if (pct >= 80) return 'bg-gradient-to-r from-emerald-400 to-teal-500';
  if (pct >= 50) return 'bg-gradient-to-r from-amber-400 to-orange-500';
  return 'bg-gradient-to-r from-rose-400 to-pink-500';
}

function getProgressTextClass(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-rose-600';
}

function getProgressBgClass(pct: number): string {
  if (pct >= 80) return 'bg-emerald-50';
  if (pct >= 50) return 'bg-amber-50';
  return 'bg-rose-50';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

const AVATAR_BG_COLORS = [
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-teal-100 text-teal-700 border-teal-200',
];

function getAvatarBgColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_BG_COLORS.length;
  return AVATAR_BG_COLORS[index]!;
}

export default function ProjectDashboardPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['project-dashboard', activeProjectId],
    queryFn: () => getProjectDashboard(activeProjectId!),
    enabled: !!activeProjectId,
    staleTime: 30_000,
  });

  if (!activeProjectId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md border border-slate-200/60 mb-4 animate-bounce">
          <span className="text-2xl">📁</span>
        </div>
        <p className="text-base font-bold text-slate-800">No active project selected</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">Select a project in the sidebar switcher to view metrics.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 px-6 py-6 space-y-8 animate-pulse overflow-y-auto bg-slate-50/50">
        <div className="space-y-2">
          <div className="h-6 w-1/4 rounded-md bg-slate-200" />
          <div className="h-4 w-1/3 rounded-md bg-slate-200" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-slate-200/80" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-slate-200/80" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-72 rounded-2xl bg-slate-200/80" />
          <div className="h-72 rounded-2xl bg-slate-200/80" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 border border-red-200 text-red-500 mb-4 shadow-sm">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="text-base font-bold text-slate-800">Failed to load project dashboard</p>
        <p className="text-xs text-slate-400 mt-1">Please try refreshing or choosing a different project.</p>
      </div>
    );
  }

  const { summary, sprintProgress, ownerStats, epicProgress, project } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* Premium Header Banner */}
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-50/30 blur-3xl" />
        <div className="absolute left-1/3 bottom-0 -mb-16 h-48 w-48 rounded-full bg-emerald-50/20 blur-2xl" />
        
        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            Executive Hub
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Project Dashboard</h1>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Real-time analytics, workload capacity balancing, and epic completion rates for{' '}
            <span className="inline-flex items-center rounded-full bg-indigo-50/80 px-2.5 py-0.5 font-semibold text-indigo-700 border border-indigo-100">
              {project.name}
            </span>
          </p>
        </div>
      </div>

      <div className="flex-1 px-8 py-8 space-y-8 max-w-[1400px] w-full mx-auto">
        {/* Section 1 - Summary Metric Cards */}
        <section className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {/* Total Tasks */}
          <div className="group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:-translate-y-1 transition-all duration-300 ease-out">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Total Tasks</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3.5xl font-black text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">{summary.totalTasks}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-400/90 font-medium">Active inside project</div>
          </div>

          {/* Completed */}
          <div className="group relative rounded-2xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50/10 to-white p-5 shadow-sm hover:shadow-[0_8px_30px_rgba(16,185,129,0.06)] hover:-translate-y-1 transition-all duration-300 ease-out">
            <span className="text-[10px] font-bold tracking-widest text-emerald-600 uppercase">Completed</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-3.5xl font-black text-emerald-600 tracking-tight">{summary.completedTasks}</span>
              {summary.totalTasks > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 font-bold">
                  {Math.round((summary.completedTasks / summary.totalTasks) * 100)}%
                </span>
              )}
            </div>
            <div className="mt-2 text-[10px] text-emerald-500/80 font-medium">Marked as done</div>
          </div>

          {/* In Progress */}
          <div className="group relative rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/10 to-white p-5 shadow-sm hover:shadow-[0_8px_30px_rgba(99,102,241,0.06)] hover:-translate-y-1 transition-all duration-300 ease-out">
            <span className="text-[10px] font-bold tracking-widest text-indigo-600 uppercase">In Progress</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3.5xl font-black text-indigo-600 tracking-tight">{summary.inProgressTasks}</span>
            </div>
            <div className="mt-2 text-[10px] text-indigo-500/80 font-medium">Currently active</div>
          </div>

          {/* Blocked */}
          <div className={`group relative rounded-2xl border p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 ${
            summary.blockedTasks > 0 
              ? 'border-rose-200 bg-gradient-to-br from-rose-50/30 to-white shadow-[0_0_15px_rgba(244,63,94,0.02)] hover:shadow-[0_8px_30px_rgba(244,63,94,0.08)]' 
              : 'border-slate-200/80 bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.03)]'
          }`}>
            <span className={`text-[10px] font-bold tracking-widest uppercase ${summary.blockedTasks > 0 ? 'text-rose-600' : 'text-slate-400'}`}>Blocked</span>
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`text-3.5xl font-black tracking-tight ${summary.blockedTasks > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{summary.blockedTasks}</span>
              {summary.blockedTasks > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
              )}
            </div>
            <div className={`mt-2 text-[10px] font-medium ${summary.blockedTasks > 0 ? 'text-rose-500/90' : 'text-slate-400/90'}`}>
              {summary.blockedTasks > 0 ? 'Requires attention' : 'No blockers'}
            </div>
          </div>

          {/* Backlog */}
          <div className="group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.03)] hover:-translate-y-1 transition-all duration-300 ease-out">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Backlog</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3.5xl font-black text-slate-800 tracking-tight group-hover:text-slate-600 transition-colors">{summary.backlogTasks}</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-400/90 font-medium">Awaiting scheduling</div>
          </div>

          {/* Deferred */}
          <div className="group relative rounded-2xl border border-amber-100/80 bg-gradient-to-br from-amber-50/10 to-white p-5 shadow-sm hover:shadow-[0_8px_30px_rgba(245,158,11,0.06)] hover:-translate-y-1 transition-all duration-300 ease-out">
            <span className="text-[10px] font-bold tracking-widest text-amber-600 uppercase">Deferred</span>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3.5xl font-black text-amber-600 tracking-tight">{summary.deferredTasks}</span>
            </div>
            <div className="mt-2 text-[10px] text-amber-500/80 font-medium">Parked/postponed</div>
          </div>
        </section>

        {/* Section 2 - Sprint Health */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
          <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 tracking-tight">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs">📅</span>
              Sprint Health & Progress
            </h2>
            <div className="text-[11px] font-medium text-slate-400">Completion Metrics</div>
          </div>
          
          {sprintProgress.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/40 rounded-xl border border-dashed border-slate-200">
              <span className="text-lg">📭</span>
              <p className="text-xs text-slate-400 mt-1 font-medium">No sprints created in this project yet.</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {sprintProgress.map((sp) => (
                <div
                  key={sp.sprint.id}
                  className={`group relative rounded-2xl border p-5 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.025)] hover:border-slate-300 ${
                    sp.sprint.status === 'ACTIVE'
                      ? 'border-indigo-200 bg-gradient-to-br from-indigo-50/15 via-white to-indigo-50/5 shadow-[0_4px_20px_rgba(99,102,241,0.03)] ring-1 ring-indigo-100/50'
                      : 'border-slate-200/80 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        sp.sprint.status === 'ACTIVE'
                          ? 'bg-emerald-500 animate-pulse'
                          : sp.sprint.status === 'COMPLETED'
                          ? 'bg-slate-300'
                          : 'bg-amber-400'
                      }`} />
                      <Link
                        href={`/sprints/${sp.sprint.id}`}
                        className="font-bold text-sm text-slate-800 hover:text-indigo-600 hover:underline truncate transition-colors"
                      >
                        {sp.sprint.name}
                      </Link>
                    </div>
                    {sp.sprint.status === 'ACTIVE' && (
                      <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-600 uppercase tracking-wide">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Visual Completion Progress Widget */}
                  <div className="flex items-center gap-3.5 mb-4">
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden relative">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(sp.completionPct)}`}
                        style={{ width: `${sp.completionPct}%` }}
                      />
                    </div>
                    <div className={`flex-shrink-0 text-center rounded px-2 py-0.5 text-[10px] font-extrabold ${getProgressTextClass(sp.completionPct)} ${getProgressBgClass(sp.completionPct)}`}>
                      {sp.completionPct}%
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-3 border-t border-slate-100/80">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">{sp.completedTasks} of {sp.totalTasks} tasks done</span>
                      {sp.blockedTasks > 0 && (
                        <span className="rounded bg-rose-50 border border-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-600 flex items-center gap-0.5 animate-pulse">
                          🚫 {sp.blockedTasks} Blocked
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-1 text-[9px] font-mono font-bold text-center">
                      <div className="rounded-md bg-slate-50 border border-slate-100/70 py-1 text-slate-500">
                        Total: {sp.totalTasks}
                      </div>
                      <div className="rounded-md bg-emerald-50/50 border border-emerald-100/40 py-1 text-emerald-600">
                        Done: {sp.completedTasks}
                      </div>
                      <div className="rounded-md bg-indigo-50/50 border border-indigo-100/40 py-1 text-indigo-600">
                        Active: {sp.inProgressTasks}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Multi-column grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Section 3 - Owner Capacity balancing */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] flex flex-col">
            <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs">👥</span>
                Workload Balance & Allocation
              </h2>
              <div className="text-[11px] font-medium text-slate-400">Team Capacity</div>
            </div>
            
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/60 text-[9px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3 text-center">Tasks</th>
                    <th className="px-4 py-3 text-center">Status (Done/Active/Blocked)</th>
                    <th className="px-4 py-3 text-right">Committed Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ownerStats.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-400/90 font-medium italic">No members assigned to this project yet.</td>
                    </tr>
                  ) : (
                    ownerStats.map((o) => {
                      const isOverloaded = o.committedHours > o.capacityHours;
                      const capPct = o.capacityHours > 0 ? Math.min((o.committedHours / o.capacityHours) * 100, 100) : 0;
                      return (
                        <tr key={o.member.id} className="hover:bg-slate-50/40 transition-colors duration-150">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {/* Better initial bubble with unique color */}
                              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold shadow-sm ${getAvatarBgColor(o.member.id)}`}>
                                {initials(o.member.name)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 truncate">{o.member.name}</div>
                                <div className="text-[10px] text-slate-400 font-medium">{o.member.role}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-700">
                            {o.assignedTasks}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-1 font-mono font-semibold text-[10px] bg-slate-50 border border-slate-100 rounded-md px-2 py-0.5 text-slate-500">
                              <span>{o.completedTasks}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-indigo-600">{o.inProgressTasks}</span>
                              <span className="text-slate-300">/</span>
                              <span className={o.blockedTasks > 0 ? 'text-red-500 font-black animate-pulse' : 'text-slate-500'}>
                                {o.blockedTasks}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              <span className={`font-mono font-bold text-[11px] ${isOverloaded ? 'text-rose-600 animate-pulse' : 'text-slate-800'}`}>
                                {o.committedHours}h / {o.capacityHours}h
                              </span>
                              {/* Premium capacity progress bar */}
                              <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden relative shadow-inner">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                                    isOverloaded 
                                      ? 'bg-gradient-to-r from-red-400 to-rose-600 shadow-[0_0_8px_rgba(244,63,94,0.4)]' 
                                      : 'bg-gradient-to-r from-indigo-400 to-indigo-600'
                                  }`}
                                  style={{ width: `${capPct}%` }}
                                />
                              </div>
                              {isOverloaded && (
                                <span className="rounded bg-rose-50 border border-rose-100 px-1 py-0.2 text-[8px] font-extrabold text-rose-600 uppercase tracking-wide">
                                  Overloaded
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4 - Epic Completion Metrics */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] flex flex-col">
            <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs">🚀</span>
                Epic Completion Analytics
              </h2>
              <Link
                href="/epics"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm shadow-indigo-100 transition-all duration-200"
              >
                Manage epics
              </Link>
            </div>
            
            <div className="flex-1 space-y-4.5 overflow-y-auto pr-1">
              {epicProgress.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/40 rounded-xl border border-dashed border-slate-200">
                  <span className="text-lg">🚀</span>
                  <p className="text-xs text-slate-400 mt-1 font-medium">No epics created in this project yet.</p>
                  <Link
                    href="/epics?create=1"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
                  >
                    Create your first epic
                  </Link>
                </div>
              ) : (
                epicProgress.map((ep) => {
                  const epicColor = ep.epic.color || '#6366f1';
                  return (
                    <div key={ep.epic.id} className="group space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span
                            className="h-3 w-3 flex-shrink-0 rounded-md border border-black/5 shadow-sm group-hover:scale-110 transition-transform duration-250"
                            style={{ backgroundColor: epicColor }}
                          />
                          <Link href="/epics" className="truncate text-slate-800 hover:text-indigo-600">
                            {ep.epic.name}
                          </Link>
                        </div>
                        <span className="font-mono text-slate-500 font-bold ml-2 flex-shrink-0">{ep.completionPct}%</span>
                      </div>
                      
                      {/* Premium Slider-Like Epic colored bar */}
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden relative shadow-inner">
                        <div
                          className="h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                          style={{
                            width: `${ep.completionPct}%`,
                            backgroundColor: epicColor,
                            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
                            backgroundSize: '1rem 1rem',
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        <span>{ep.completedTasks} of {ep.totalTasks} tasks completed</span>
                        <span className="font-semibold">{ep.totalTasks - ep.completedTasks} remaining</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
