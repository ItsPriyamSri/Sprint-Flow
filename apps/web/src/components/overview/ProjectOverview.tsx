'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { ProjectOverviewDto, SprintHealthDto } from '@sprintflow/shared';
import { SprintCreateModal } from '@/components/scrum/SprintCreateModal';
import { confirmDeleteSprint } from '@/lib/deleteActions';

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

function MetricCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1.5 text-3xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function BufferBar({ planned, budget }: { planned: number; budget: number }) {
  const used = pct(planned, budget);
  const isOver = planned > budget;
  return (
    <div className="mt-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : used > 85 ? 'bg-amber-400' : 'bg-indigo-500'}`}
          style={{ width: `${Math.min(100, used)}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        {planned}h used · {Math.max(0, budget - planned)}h buffer · {budget}h budget
      </p>
    </div>
  );
}

function EstimationPerformance({ sh }: { sh: SprintHealthDto }) {
  const hasActuals = sh.actualsLoggedCount > 0;
  const notLogged = sh.actualsExpectedCount - sh.actualsLoggedCount;

  const effColor =
    sh.efficiencyPct == null ? ''
    : sh.efficiencyPct >= 100 ? 'text-emerald-600'
    : sh.efficiencyPct >= 80  ? 'text-amber-600'
    : 'text-rose-600';

  const varianceSign = sh.varianceHours != null && sh.varianceHours >= 0 ? '+' : '';

  return (
    <div className="mt-4 border-t border-slate-50 pt-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
        Estimation Performance
      </span>

      {!hasActuals ? (
        <p className="text-[10px] text-slate-400 italic">
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
            <span className={`text-[10px] font-semibold ${sh.varianceHours != null && sh.varianceHours >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {sh.varianceHours != null
                ? `${varianceSign}${sh.varianceHours.toFixed(1)}h (${varianceSign}${sh.variancePct?.toFixed(1)}%)`
                : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">Efficiency</span>
            <span className={`text-[10px] font-bold ${effColor}`}>
              {sh.efficiencyPct != null ? `${Math.round(sh.efficiencyPct)}%` : '—'}
            </span>
          </div>

          {notLogged > 0 && (
            <div className="mt-1 rounded bg-amber-50 border border-amber-100 px-2 py-1 text-[9px] font-medium text-amber-700">
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
  const statusColor = {
    ACTIVE:    'bg-green-100 text-green-700',
    PLANNING:  'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-slate-100 text-slate-500',
  }[sh.sprint.status] ?? 'bg-slate-100 text-slate-500';

  const completionPct = pct(sh.completedTasks, sh.totalTasks);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 hover:border-indigo-200 hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full relative group">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
              {sh.sprint.name}
            </h3>
            {sh.sprint.goal && (
              <p className="mt-1 text-xs text-slate-400 truncate" title={sh.sprint.goal}>
                {sh.sprint.goal}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${statusColor}`}>
                {sh.sprint.status}
              </span>
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
                className="rounded p-1 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 transition-all"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            {sh.sprint.releaseMilestone && (
              <span className="rounded-md bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[9px] font-extrabold text-indigo-600 tracking-wide uppercase">
                🚀 {sh.sprint.releaseLabel ?? 'Release'}
              </span>
            )}
          </div>
        </div>

        {/* Warning Indicator for Blocked Tasks */}
        {sh.blockedTasks > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-1.5 text-xs text-red-700 font-medium flex items-center gap-1.5 animate-pulse">
            <span>🚫</span>
            <span>{sh.blockedTasks} blocked task{sh.blockedTasks > 1 ? 's' : ''} requiring attention</span>
          </div>
        )}

        {/* Sprint Capacity / Hours Buffer Bar */}
        <div className="mt-4 border-t border-slate-50 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Capacity Allocation</span>
          <BufferBar planned={sh.plannedHours} budget={sh.budgetHours} />
        </div>

        {/* Sprint Completion Progress Bar */}
        <div className="mt-4 border-t border-slate-50 pt-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            <span>Sprint Completion</span>
            <span className="text-slate-600 normal-case">{sh.completedTasks}/{sh.totalTasks} tasks ({completionPct}%)</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all bg-emerald-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>

        {/* Task Status Summary Badges */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-50 pt-3">
          <span className="rounded bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500 border border-slate-100">
            Todo: {sh.todoTasks}
          </span>
          <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 border border-amber-100">
            In Progress: {sh.inProgressTasks}
          </span>
          <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 border border-emerald-100">
            Done: {sh.completedTasks}
          </span>
          {sh.blockedTasks > 0 && (
            <span className="rounded bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 border border-red-100 font-bold">
              Blocked: {sh.blockedTasks}
            </span>
          )}
        </div>

        {/* Estimation Performance */}
        <EstimationPerformance sh={sh} />
      </div>

      {/* Quick Action Links */}
      <div className="mt-6 border-t border-slate-100 pt-4 flex gap-2">
        <Link 
          href={`/sprints/${sh.sprint.id}`}
          className="flex-1 text-center rounded-lg bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          View Sprint
        </Link>
        <Link 
          href={`/board?sprint=${sh.sprint.id}`}
          className="flex-1 text-center rounded-lg bg-indigo-50 border border-indigo-150 text-indigo-700 px-3 py-1.5 text-xs font-semibold hover:bg-indigo-100 hover:text-indigo-800 transition-colors"
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
  const totalBudget  = allSprints.reduce((s, sh) => s + sh.budgetHours, 0);
  const currentBuffer = currentSprint?.bufferHours ?? null;

  // Rolling efficiency: last 3 completed sprints with actuals logged
  const completedWithActuals = allSprints
    .filter((sh) => sh.sprint.status === 'COMPLETED' && sh.efficiencyPct != null)
    .slice(-3);
  const rollingEfficiency = completedWithActuals.length > 0
    ? Math.round(completedWithActuals.reduce((s, sh) => s + sh.efficiencyPct!, 0) / completedWithActuals.length)
    : null;

  // Sprint efficiency: prefer active sprint, fall back to most recent sprint with actuals
  const sprintWithActuals = [...allSprints].reverse().find((sh) => sh.efficiencyPct != null);
  const activeEfficiency =
    currentSprint?.efficiencyPct != null ? Math.round(currentSprint.efficiencyPct)
    : sprintWithActuals?.efficiencyPct != null ? Math.round(sprintWithActuals.efficiencyPct)
    : null;
  const efficiencySprintLabel =
    currentSprint?.efficiencyPct != null ? currentSprint.sprint.name
    : sprintWithActuals ? sprintWithActuals.sprint.name
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
        {project.description && <p className="mt-0.5 text-sm text-slate-500">{project.description}</p>}
      </div>

      <div className="flex-1 px-6 py-6 space-y-8">
        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Planned vs Budget"
            value={`${totalPlanned}h`}
            sub={`of ${totalBudget}h total budget`}
            accent={totalPlanned > totalBudget ? 'text-red-600' : 'text-slate-900'}
          />
          <MetricCard
            label="Current Buffer"
            value={currentBuffer !== null ? `${currentBuffer}h` : '—'}
            sub={currentSprint ? currentSprint.sprint.name : 'No active sprint'}
            accent={currentBuffer !== null && currentBuffer < 0 ? 'text-red-600' : 'text-emerald-600'}
          />
          <MetricCard
            label="Done this week"
            value={tasksCompletedThisWeek}
            sub="tasks completed"
          />
          <MetricCard
            label="Backlog"
            value={backlogTasks}
            sub="tasks not in a sprint"
            accent={backlogTasks > 0 ? 'text-amber-600' : 'text-slate-900'}
          />
          <MetricCard
            label="Sprint Efficiency"
            value={activeEfficiency !== null ? `${activeEfficiency}%` : '—'}
            sub={efficiencySprintLabel ?? 'No actuals logged'}
            accent={
              activeEfficiency === null ? 'text-slate-400'
              : activeEfficiency >= 100 ? 'text-emerald-600'
              : activeEfficiency >= 80  ? 'text-amber-600'
              : 'text-rose-600'
            }
          />
          <MetricCard
            label="Days to release"
            value={daysToNextRelease !== null ? daysToNextRelease : '—'}
            sub={daysToNextRelease !== null ? 'days remaining' : 'No upcoming release'}
          />
        </div>

        {/* Sprint health strip */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">Sprint Health</h2>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-55 bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm shadow-indigo-100 transition-all duration-200"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
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
                <p className="text-sm text-slate-500 font-medium">No active or planned sprints found.</p>
                <p className="text-xs text-slate-400 mt-1">Get started by creating your first sprint for this project.</p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  Create Your First Sprint
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Team workload */}
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
                        {mw.p0Count > 0
                          ? <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700">{mw.p0Count}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        {mw.overloaded
                          ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 animate-pulse">OVERLOADED</span>
                          : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-600">OK</span>
                        }
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
