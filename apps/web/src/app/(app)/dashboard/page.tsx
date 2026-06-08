'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getProjectDashboard } from '@/lib/api/projects';
import Link from 'next/link';
import { MetricCard } from '@/components/ui/MetricCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  ListIcon,
  CheckCircleIcon,
  ActivityIcon,
  AlertTriangleIcon,
  LayersIcon,
  ArchiveIcon,
  CalendarIcon,
  UsersIcon,
  RocketIcon,
  FolderIcon,
  InboxIcon,
} from '@/components/ui/icons';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
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
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200/60 bg-white shadow-md">
          <FolderIcon className="h-8 w-8 text-slate-400" />
        </div>
        <p className="text-base font-bold text-slate-800">No active project selected</p>
        <p className="mt-1 max-w-xs text-xs text-slate-400">Select a project in the sidebar switcher to view metrics.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 animate-pulse space-y-8 overflow-y-auto bg-slate-50/50 px-6 py-6">
        <div className="space-y-2">
          <div className="h-6 w-1/4 rounded-md bg-slate-200" />
          <div className="h-4 w-1/3 rounded-md bg-slate-200" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-200/80" />
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
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-500 shadow-sm">
          <AlertTriangleIcon className="h-8 w-8" />
        </div>
        <p className="text-base font-bold text-slate-800">Failed to load project dashboard</p>
        <p className="mt-1 text-xs text-slate-400">Please try refreshing or choosing a different project.</p>
      </div>
    );
  }

  const { summary, sprintProgress, ownerStats, epicProgress, project } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* Header Banner — calmer version */}
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm">
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-indigo-50/20 blur-3xl" />

        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 motion-safe:animate-pulse" />
            Executive Hub
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Project Dashboard</h1>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-500">
            Real-time analytics, workload capacity balancing, and epic completion rates for{' '}
            <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/80 px-2.5 py-0.5 font-semibold text-indigo-700">
              {project.name}
            </span>
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] flex-1 space-y-8 px-8 py-8">
        {/* Summary Metric Cards */}
        <section className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Total Tasks"
            value={summary.totalTasks}
            sub="Active inside project"
            tone="neutral"
            icon={<ListIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Completed"
            value={summary.completedTasks}
            sub={
              summary.totalTasks > 0
                ? `${Math.round((summary.completedTasks / summary.totalTasks) * 100)}% of total`
                : 'Marked as done'
            }
            tone="emerald"
            icon={<CheckCircleIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="In Progress"
            value={summary.inProgressTasks}
            sub="Currently active"
            tone="indigo"
            icon={<ActivityIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Blocked"
            value={summary.blockedTasks}
            sub={summary.blockedTasks > 0 ? 'Requires attention' : 'No blockers'}
            tone={summary.blockedTasks > 0 ? 'rose' : 'neutral'}
            icon={<AlertTriangleIcon className="h-3.5 w-3.5" />}
            badge={
              summary.blockedTasks > 0 ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                </span>
              ) : undefined
            }
          />
          <MetricCard
            label="Backlog"
            value={summary.backlogTasks}
            sub="Awaiting scheduling"
            tone="neutral"
            icon={<LayersIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Deferred"
            value={summary.deferredTasks}
            sub="Parked / postponed"
            tone="amber"
            icon={<ArchiveIcon className="h-3.5 w-3.5" />}
          />
        </section>

        {/* Sprint Health */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
          <SectionHeader
            icon={<CalendarIcon className="h-4 w-4" />}
            title="Sprint Health & Progress"
            meta="Completion Metrics"
          />

          {sprintProgress.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-8 text-center">
              <InboxIcon className="h-6 w-6 text-slate-300" />
              <p className="mt-2 text-xs font-medium text-slate-400">No sprints created in this project yet.</p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {sprintProgress.map((sp) => (
                <div
                  key={sp.sprint.id}
                  className={`group relative rounded-xl border p-5 transition-all duration-200 ease-out
                    motion-safe:hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:border-slate-300
                    ${sp.sprint.status === 'ACTIVE'
                      ? 'border-indigo-200 bg-gradient-to-br from-indigo-50/10 via-white to-indigo-50/5 shadow-md shadow-indigo-50/40 ring-1 ring-indigo-200'
                      : 'border-slate-200/80 bg-white'
                    }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 flex-shrink-0 rounded-full ${
                          sp.sprint.status === 'ACTIVE'
                            ? 'bg-emerald-500 motion-safe:animate-pulse'
                            : sp.sprint.status === 'COMPLETED'
                              ? 'bg-slate-300'
                              : 'bg-amber-400'
                        }`}
                      />
                      <Link
                        href={`/sprints/${sp.sprint.id}`}
                        className="truncate text-sm font-bold text-slate-800 transition-colors hover:text-indigo-600 hover:underline"
                      >
                        {sp.sprint.name}
                      </Link>
                    </div>
                    {sp.sprint.status !== 'PLANNING' && (
                      <StatusBadge status={sp.sprint.status} />
                    )}
                  </div>

                  <div className="mb-4 flex items-center gap-3.5">
                    <div className="flex-1">
                      <ProgressBar value={sp.completionPct} tone="auto" height="sm" />
                    </div>
                    <div
                      className={`flex-shrink-0 rounded px-2 py-0.5 text-xs font-extrabold ${
                        sp.completionPct >= 80
                          ? 'bg-emerald-50 text-emerald-600'
                          : sp.completionPct >= 50
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {sp.completionPct}%
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 border-t border-slate-100/80 pt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="text-sm font-semibold text-slate-600">
                        {sp.completedTasks} of {sp.totalTasks} tasks done
                      </span>
                      {sp.blockedTasks > 0 && (
                        <span className="flex items-center gap-0.5 rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600 motion-safe:animate-pulse">
                          <AlertTriangleIcon className="h-2.5 w-2.5" />
                          {sp.blockedTasks} Blocked
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-center text-xs font-mono font-bold">
                      <div className="rounded-md border border-slate-100/70 bg-slate-50 py-1.5 text-slate-500">
                        Total: {sp.totalTasks}
                      </div>
                      <div className="rounded-md border border-emerald-100/40 bg-emerald-50/50 py-1.5 text-emerald-600">
                        Done: {sp.completedTasks}
                      </div>
                      <div className="rounded-md border border-indigo-100/40 bg-indigo-50/50 py-1.5 text-indigo-600">
                        Active: {sp.inProgressTasks}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Workload Balance */}
          <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
            <SectionHeader
              icon={<UsersIcon className="h-4 w-4" />}
              title="Workload Balance & Allocation"
              meta="Team Capacity"
            />

            <div className="flex-1 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3 text-center">Tasks</th>
                    <th className="px-4 py-3 text-center">Done / Active / Blocked</th>
                    <th className="px-4 py-3 text-right">Committed Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ownerStats.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center font-medium italic text-slate-400/90">
                        No members assigned to this project yet.
                      </td>
                    </tr>
                  ) : (
                    ownerStats.map((o) => {
                      const isOverloaded = o.committedHours > o.capacityHours;
                      const capPct =
                        o.capacityHours > 0
                          ? Math.min((o.committedHours / o.capacityHours) * 100, 100)
                          : 0;
                      return (
                        <tr key={o.member.id} className="transition-colors duration-150 hover:bg-slate-50/40">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold shadow-sm ${getAvatarBgColor(o.member.id)}`}
                              >
                                {initials(o.member.name)}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-slate-800">{o.member.name}</div>
                                <div className="text-xs font-medium capitalize text-slate-400">
                                  {o.member.role.toLowerCase()}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-700">
                            {o.assignedTasks}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-xs font-mono font-semibold text-slate-500">
                              <span>{o.completedTasks}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-indigo-600">{o.inProgressTasks}</span>
                              <span className="text-slate-300">/</span>
                              <span
                                className={
                                  o.blockedTasks > 0
                                    ? 'font-black text-red-500 motion-safe:animate-pulse'
                                    : 'text-slate-500'
                                }
                              >
                                {o.blockedTasks}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-col items-end gap-1.5">
                              <span
                                className={`text-xs font-mono font-bold ${
                                  isOverloaded
                                    ? 'text-rose-600 motion-safe:animate-pulse'
                                    : 'text-slate-800'
                                }`}
                              >
                                {o.committedHours}h / {o.capacityHours}h
                              </span>
                              <div className="w-24">
                                <ProgressBar
                                  value={capPct}
                                  fillClassName={
                                    isOverloaded
                                      ? 'bg-gradient-to-r from-red-400 to-rose-600 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                      : 'bg-gradient-to-r from-indigo-400 to-indigo-600'
                                  }
                                />
                              </div>
                              {isOverloaded && (
                                <span className="rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-600">
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

          {/* Epic Completion */}
          <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)]">
            <SectionHeader
              icon={<RocketIcon className="h-4 w-4" />}
              title="Epic Completion Analytics"
              action={
                <Link
                  href="/epics"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-100
                    hover:bg-indigo-700
                    motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:shadow-indigo-100
                    active:translate-y-0
                    transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                >
                  Manage epics
                </Link>
              }
            />

            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {epicProgress.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/40 py-8 text-center">
                  <RocketIcon className="h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-xs font-medium text-slate-400">No epics created in this project yet.</p>
                  <Link
                    href="/epics?create=1"
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700
                      hover:bg-indigo-50
                      transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
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
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <span
                            className="h-3 w-3 flex-shrink-0 rounded-md border border-black/5 shadow-sm transition-transform duration-200 group-hover:scale-110"
                            style={{ backgroundColor: epicColor }}
                          />
                          <Link href="/epics" className="truncate text-slate-800 hover:text-indigo-600">
                            {ep.epic.name}
                          </Link>
                        </div>
                        <span className="ml-2 flex-shrink-0 font-mono font-bold text-slate-500">
                          {ep.completionPct}%
                        </span>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner">
                        <div
                          className="h-full rounded-full motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out"
                          style={{
                            width: `${ep.completionPct}%`,
                            backgroundColor: epicColor,
                            backgroundImage:
                              'linear-gradient(90deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
                            backgroundSize: '1rem 1rem',
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-400">
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
