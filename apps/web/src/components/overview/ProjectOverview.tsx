'use client';

import Link from 'next/link';
import type { ProjectOverviewDto, SprintHealthDto } from '@sprintflow/shared';

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

function SprintCard({ sh }: { sh: SprintHealthDto }) {
  const statusColor = {
    ACTIVE:    'bg-green-100 text-green-700',
    PLANNING:  'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-slate-100 text-slate-500',
  }[sh.sprint.status] ?? 'bg-slate-100 text-slate-500';

  return (
    <Link href={`/sprints/${sh.sprint.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-200 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-slate-800 truncate">{sh.sprint.name}</p>
          {sh.sprint.goal && <p className="mt-0.5 text-xs text-slate-500 truncate">{sh.sprint.goal}</p>}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor}`}>
            {sh.sprint.status}
          </span>
          {sh.sprint.releaseMilestone && (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600">
              {sh.sprint.releaseLabel ?? 'Release'}
            </span>
          )}
        </div>
      </div>

      <BufferBar planned={sh.plannedHours} budget={sh.budgetHours} />

      <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
        <span>{sh.completedTasks}/{sh.totalTasks} done</span>
        {sh.sprint.endDate && <span>ends {formatDate(sh.sprint.endDate)}</span>}
      </div>
    </Link>
  );
}

export function ProjectOverview({ data }: Props) {
  const { project, currentSprint, allSprints, daysToNextRelease, tasksCompletedThisWeek } = data;

  const totalPlanned = allSprints.reduce((s, sh) => s + sh.plannedHours, 0);
  const totalBudget  = allSprints.reduce((s, sh) => s + sh.budgetHours, 0);
  const currentBuffer = currentSprint?.bufferHours ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-slate-900">{project.name}</h1>
        {project.description && <p className="mt-0.5 text-sm text-slate-500">{project.description}</p>}
      </div>

      <div className="flex-1 px-6 py-6 space-y-8">
        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            label="Days to release"
            value={daysToNextRelease !== null ? daysToNextRelease : '—'}
            sub={daysToNextRelease !== null ? 'days remaining' : 'No upcoming release'}
          />
        </div>

        {/* Sprint health strip */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Sprint Health</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allSprints.map((sh) => (
              <SprintCard key={sh.sprint.id} sh={sh} />
            ))}
            {allSprints.length === 0 && (
              <p className="col-span-full text-sm text-slate-400">No sprints found. Add sprints to this project.</p>
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
                          ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">OVERLOADED</span>
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
    </div>
  );
}
