'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectOverviewDto, SprintHealthDto } from '@sprintflow/shared';
import { SprintCreateModal } from '@/components/scrum/SprintCreateModal';
import { confirmDeleteSprint } from '@/lib/deleteActions';
import { MetricCard } from '@/components/ui/MetricCard';
import type { MetricTone } from '@/components/ui/MetricCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  BarChartIcon,
  ShieldIcon,
  CheckCircleIcon,
  LayersIcon,
  ZapIcon,
  CalendarIcon,
  RocketIcon,
  AlertTriangleIcon,
  TrashIcon,
  PlusIcon,
} from '@/components/ui/icons';

interface Props {
  data: ProjectOverviewDto;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pct(a: number, b: number): number {
  if (b <= 0) return 0;
  return Math.min(100, Math.round((a / b) * 100));
}

function CapacityBar({ planned, budget }: { planned: number; budget: number }) {
  const used = pct(planned, budget);
  const isOver = planned > budget;
  const tone = isOver ? 'rose' : used > 85 ? 'amber' : 'indigo';
  return (
    <div className="mt-1.5">
      <ProgressBar value={Math.min(100, used)} tone={tone} />
      <p className="mt-1 text-[10px] text-slate-500">
        {planned}h used · {Math.max(0, budget - planned)}h buffer · {budget}h budget
      </p>
    </div>
  );
}

const pillBase = 'inline-flex items-center rounded-md border-l-2 px-2 py-0.5 text-[10px] font-semibold';
const pillTones = {
  emerald: 'border-l-emerald-500 bg-emerald-50 text-emerald-700',
  rose: 'border-l-rose-500 bg-rose-50 text-rose-700',
  amber: 'border-l-amber-400 bg-amber-50 text-amber-700',
  slate: 'border-l-slate-300 bg-slate-50 text-slate-500',
} as const;

function EstimationPerformance({ sh }: { sh: SprintHealthDto }) {
  const hasActuals = sh.actualsLoggedCount > 0;
  const notLogged = sh.actualsExpectedCount - sh.actualsLoggedCount;
  const varianceSign = sh.varianceHours != null && sh.varianceHours >= 0 ? '+' : '';

  const variancePillTone = sh.varianceHours != null && sh.varianceHours >= 0 ? 'emerald' : 'rose';
  const effPillTone: keyof typeof pillTones =
    sh.efficiencyPct == null ? 'slate'
    : sh.efficiencyPct >= 100 ? 'emerald'
    : sh.efficiencyPct >= 80  ? 'amber'
    : 'rose';

  return (
    <div className="mt-4 border-t border-slate-50 pt-3">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Estimation Performance
      </span>

      {!hasActuals ? (
        <p className="text-[10px] italic text-slate-400">
          {sh.actualsExpectedCount > 0
            ? `No actuals logged yet — ${sh.actualsExpectedCount} assignment${sh.actualsExpectedCount > 1 ? 's' : ''} pending`
            : 'No completed assignments to track'}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Actual / Planned</span>
            <span className="text-[10px] font-semibold text-slate-700">
              {sh.actualHours}h / {sh.plannedHoursLogged}h
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Variance</span>
            <span className={`${pillBase} ${pillTones[variancePillTone]}`}>
              {sh.varianceHours != null
                ? `${varianceSign}${sh.varianceHours.toFixed(1)}h (${varianceSign}${sh.variancePct?.toFixed(1)}%)`
                : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Efficiency</span>
            <span className={`${pillBase} ${pillTones[effPillTone]}`}>
              {sh.efficiencyPct != null ? `${Math.round(sh.efficiencyPct)}%` : '—'}
            </span>
          </div>

          {notLogged > 0 && (
            <div className="mt-1 rounded border border-amber-100 bg-amber-50 px-2 py-1 text-[9px] font-medium text-amber-700">
              {notLogged} assignment{notLogged > 1 ? 's' : ''} not yet logged
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SprintCard({
  sh,
  workspaceId,
  projectId,
}: {
  sh: SprintHealthDto;
  workspaceId: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const completionPct = pct(sh.completedTasks, sh.totalTasks);

  const statusCardClass = {
    ACTIVE: 'ring-1 ring-indigo-200 bg-gradient-to-br from-indigo-50/10 to-white shadow-md shadow-indigo-50/40',
    PLANNING: 'border-l-[3px] border-l-amber-400',
    COMPLETED: 'bg-slate-50/30 opacity-90',
  }[sh.sprint.status] ?? '';

  return (
    <div
      className={`relative flex h-full flex-col justify-between rounded-xl border border-slate-200 p-5 transition-all duration-200 ease-out group
        motion-safe:hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:border-indigo-200
        ${statusCardClass}`}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
              {sh.sprint.name}
            </h3>
            {sh.sprint.goal && (
              <p className="mt-1 truncate text-xs text-slate-400" title={sh.sprint.goal}>
                {sh.sprint.goal}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              <StatusBadge status={sh.sprint.status} />
              <button
                type="button"
                title={`Delete ${sh.sprint.name}`}
                onClick={() => {
                  void confirmDeleteSprint({
                    sprintId: sh.sprint.id,
                    sprintName: sh.sprint.name,
                    workspaceId,
                    projectId,
                    queryClient,
                  });
                }}
                className="rounded p-1 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 transition-all
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-1"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            {sh.sprint.releaseMilestone && (
              <span className="flex items-center gap-1 rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-indigo-600">
                <RocketIcon className="h-2.5 w-2.5" />
                {sh.sprint.releaseLabel ?? 'Release'}
              </span>
            )}
          </div>
        </div>

        {sh.blockedTasks > 0 && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 motion-safe:animate-pulse">
            <AlertTriangleIcon className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{sh.blockedTasks} blocked task{sh.blockedTasks > 1 ? 's' : ''} requiring attention</span>
          </div>
        )}

        <div className="mt-4 border-t border-slate-50 pt-3">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Capacity Allocation</span>
          <CapacityBar planned={sh.plannedHours} budget={sh.budgetHours} />
        </div>

        <div className="mt-4 border-t border-slate-50 pt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Sprint Completion</span>
            <span className="normal-case text-slate-600">
              {sh.completedTasks}/{sh.totalTasks} tasks ({completionPct}%)
            </span>
          </div>
          <ProgressBar value={completionPct} tone="auto" />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-50 pt-3">
          <span className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
            Todo: {sh.todoTasks}
          </span>
          <span className="rounded border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
            In Progress: {sh.inProgressTasks}
          </span>
          <span className="rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
            Done: {sh.completedTasks}
          </span>
          {sh.blockedTasks > 0 && (
            <span className="rounded border border-red-100 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">
              Blocked: {sh.blockedTasks}
            </span>
          )}
        </div>

        <EstimationPerformance sh={sh} />
      </div>

      <div className="mt-6 flex gap-2 border-t border-slate-100 pt-4">
        <Link
          href={`/sprints/${sh.sprint.id}`}
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-xs font-semibold text-slate-700
            hover:bg-slate-100 hover:text-slate-900
            motion-safe:hover:-translate-y-0.5 hover:shadow-md
            active:translate-y-0
            transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
        >
          View Sprint
        </Link>
        <Link
          href={`/board?sprint=${sh.sprint.id}`}
          className="flex-1 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-center text-xs font-semibold text-indigo-700
            hover:bg-indigo-100 hover:text-indigo-800
            motion-safe:hover:-translate-y-0.5 hover:shadow-md
            active:translate-y-0
            transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
        >
          View Board
        </Link>
      </div>
    </div>
  );
}

export function ProjectOverview({ data }: Props) {
  const queryClient = useQueryClient();
  const { project, currentSprint, allSprints, daysToNextRelease, tasksCompletedThisWeek, backlogTasks } = data;

  const [createModalOpen, setCreateModalOpen] = useState(false);

  const totalPlanned = allSprints.reduce((s, sh) => s + sh.plannedHours, 0);
  const totalBudget = allSprints.reduce((s, sh) => s + sh.budgetHours, 0);
  const currentBuffer = currentSprint?.bufferHours ?? null;

  const completedWithActuals = allSprints
    .filter((sh) => sh.sprint.status === 'COMPLETED' && sh.efficiencyPct != null)
    .slice(-3);
  const rollingEfficiency =
    completedWithActuals.length > 0
      ? Math.round(
          completedWithActuals.reduce((s, sh) => s + sh.efficiencyPct!, 0) / completedWithActuals.length,
        )
      : null;
  void rollingEfficiency;

  const sprintWithActuals = [...allSprints].reverse().find((sh) => sh.efficiencyPct != null);
  const activeEfficiency =
    currentSprint?.efficiencyPct != null
      ? Math.round(currentSprint.efficiencyPct)
      : sprintWithActuals?.efficiencyPct != null
        ? Math.round(sprintWithActuals.efficiencyPct)
        : null;
  const efficiencySprintLabel =
    currentSprint?.efficiencyPct != null
      ? currentSprint.sprint.name
      : sprintWithActuals
        ? sprintWithActuals.sprint.name
        : null;

  const isActiveSprint = currentSprint?.sprint.status === 'ACTIVE';

  const budgetTone: MetricTone = totalPlanned > totalBudget ? 'rose' : 'indigo';
  const bufferTone: MetricTone =
    currentBuffer === null ? 'neutral' : currentBuffer < 0 ? 'rose' : 'emerald';
  const backlogTone: MetricTone = backlogTasks > 0 ? 'amber' : 'neutral';
  const efficiencyTone: MetricTone =
    activeEfficiency === null
      ? 'slate'
      : activeEfficiency >= 100
        ? 'emerald'
        : activeEfficiency >= 80
          ? 'amber'
          : 'rose';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Project Overview
          </span>
          {isActiveSprint && (
            <span className="flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 motion-safe:animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Live</span>
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
        {project.description && <p className="mt-0.5 text-sm text-slate-500">{project.description}</p>}
      </div>

      <div className="flex-1 space-y-8 px-6 py-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Planned vs Budget"
            value={`${totalPlanned}h`}
            sub={`of ${totalBudget}h total budget`}
            tone={budgetTone}
            icon={<BarChartIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Current Buffer"
            value={currentBuffer !== null ? `${currentBuffer}h` : '—'}
            sub={currentSprint ? currentSprint.sprint.name : 'No active sprint'}
            tone={bufferTone}
            icon={<ShieldIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Done this week"
            value={tasksCompletedThisWeek}
            sub="tasks completed"
            tone="emerald"
            icon={<CheckCircleIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Backlog"
            value={backlogTasks}
            sub="tasks not in a sprint"
            tone={backlogTone}
            icon={<LayersIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Sprint Efficiency"
            value={activeEfficiency !== null ? `${activeEfficiency}%` : '—'}
            sub={efficiencySprintLabel ?? 'No actuals logged'}
            tone={efficiencyTone}
            icon={<ZapIcon className="h-3.5 w-3.5" />}
          />
          <MetricCard
            label="Days to release"
            value={daysToNextRelease !== null ? daysToNextRelease : '—'}
            sub={daysToNextRelease !== null ? 'days remaining' : 'No upcoming release'}
            tone="slate"
            icon={<CalendarIcon className="h-3.5 w-3.5" />}
          />
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Sprint Health</h2>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-100
                hover:bg-indigo-700
                motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:shadow-indigo-100
                active:translate-y-0
                transition-all duration-200
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
            >
              <PlusIcon className="h-4 w-4" />
              Create Sprint
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allSprints.map((sh) => (
              <SprintCard
                key={sh.sprint.id}
                sh={sh}
                workspaceId={project.workspaceId}
                projectId={project.id}
              />
            ))}
            {allSprints.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <p className="text-sm font-medium text-slate-500">No active or planned sprints found.</p>
                <p className="mt-1 text-xs text-slate-400">Get started by creating your first sprint for this project.</p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700
                    hover:bg-indigo-50
                    motion-safe:hover:-translate-y-0.5
                    transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                >
                  Create Your First Sprint
                </button>
              </div>
            )}
          </div>
        </div>

        {currentSprint && currentSprint.memberWorkload.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Team — {currentSprint.sprint.name}
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Member</th>
                    <th className="px-4 py-2.5 text-right">Committed</th>
                    <th className="px-4 py-2.5 text-right">Capacity</th>
                    <th className="px-4 py-2.5 text-right">P0</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentSprint.memberWorkload.map((mw) => (
                    <tr key={mw.member.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">
                            {mw.member.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800">{mw.member.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {mw.committedHours}h
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-400">
                        {mw.weeklyCapacity}h
                      </td>
                      <td className="px-4 py-3 text-right">
                        {mw.p0Count > 0 ? (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">
                            {mw.p0Count}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {mw.overloaded ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 motion-safe:animate-pulse">
                            OVERLOADED
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <SprintCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        workspaceId={project.workspaceId}
        projectId={project.id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['workspace'] });
          queryClient.invalidateQueries({ queryKey: ['project-overview', project.id] });
        }}
      />
    </div>
  );
}
