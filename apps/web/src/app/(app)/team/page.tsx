'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getTeamView } from '@/lib/api/projects';
import type { TeamMemberDto } from '@sprintflow/shared';

function initials(name: string) {
  return name.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function MemberCard({ data, daysPerWeek }: { data: TeamMemberDto; daysPerWeek: number }) {
  const { member, totalCommittedHours, totalCapacityHours, perSprint, overloaded } = data;
  const pct = totalCapacityHours > 0 ? Math.min(100, Math.round((totalCommittedHours / totalCapacityHours) * 100)) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
          {initials(member.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800">{member.name}</p>
          <p className="text-xs text-slate-400">{member.role} · {member.hoursPerDay}h/day · {member.hoursPerDay * daysPerWeek}h/week</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-bold ${overloaded ? 'text-red-600' : 'text-slate-800'}`}>
            {totalCommittedHours}h
          </p>
          <p className="text-xs text-slate-400">of {totalCapacityHours}h total</p>
        </div>
        {overloaded && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 shrink-0">
            ⚠ Overloaded
          </span>
        )}
      </div>

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${overloaded ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {perSprint.length > 0 && (
        <table className="w-full text-xs text-slate-600">
          <thead>
            <tr className="text-slate-400 uppercase tracking-wide">
              <th className="text-left pb-1">Sprint</th>
              <th className="text-right pb-1">Committed</th>
              <th className="text-right pb-1">Budget</th>
              <th className="pb-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {perSprint.map((sb) => (
              <tr key={sb.sprintId}>
                <td className="py-1 font-medium text-slate-700">{sb.sprintName}</td>
                <td className={`py-1 text-right font-mono ${sb.overloaded ? 'text-red-600 font-semibold' : ''}`}>
                  {sb.committedHours}h
                </td>
                <td className="py-1 text-right font-mono text-slate-400">{sb.budgetHours}h</td>
                <td className="py-1 pl-2">
                  {sb.overloaded && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">over</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TeamPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) => s.activeProject);
  const daysPerWeek = activeProject?.daysPerWeek ?? 6;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['team', activeProjectId],
    queryFn: () => getTeamView(activeProjectId!),
    enabled: !!activeProjectId,
    staleTime: 30_000,
  });

  if (!activeProjectId) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a project.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-slate-900">Team</h1>
        <p className="mt-0.5 text-sm text-slate-500">Capacity vs. committed hours across all sprints.</p>
      </div>
      <div className="flex-1 px-6 py-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        ) : isError || !data ? (
          <div className="text-center text-sm text-slate-400">Failed to load team data.</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {data.team.map((m) => (
              <MemberCard key={m.member.id} data={m} daysPerWeek={daysPerWeek} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
