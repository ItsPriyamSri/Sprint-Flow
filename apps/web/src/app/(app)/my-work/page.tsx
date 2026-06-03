'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getMyWork } from '@/lib/api/projects';
import type { MyWorkDto, MyWorkTaskDto, MemberWorkSummaryDto } from '@sprintflow/shared';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-50 text-red-700 border-red-200/60',
  P1: 'bg-amber-50 text-amber-700 border-amber-200/60',
  P2: 'bg-slate-50 text-slate-600 border-slate-200/60',
};

const PRIORITY_RIBBONS: Record<string, string> = {
  P0: 'bg-gradient-to-b from-red-400 to-rose-500',
  P1: 'bg-gradient-to-b from-amber-400 to-orange-500',
  P2: 'bg-gradient-to-b from-slate-300 to-slate-400',
};

function TaskCard({ task }: { task: MyWorkTaskDto }) {
  const priorityRibbon = task.priority ? PRIORITY_RIBBONS[task.priority] : 'bg-slate-200';
  const cardBorder = task.blocked 
    ? 'border-red-200 shadow-[0_4px_12px_rgba(244,63,94,0.01)] bg-red-50/5 hover:shadow-[0_8px_30px_rgba(244,63,94,0.04)] hover:border-red-300' 
    : 'border-slate-200/70 bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.025)] hover:border-slate-300';

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 pl-6 transition-all duration-300 ease-out hover:-translate-y-1 ${cardBorder} ${task.done ? 'opacity-55' : ''}`}>
      {/* Priority accent side ribbon */}
      <span className={`absolute left-0 top-0 bottom-0 w-[5px] ${priorityRibbon}`} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {task.priority && (
            <span className={`rounded-md border px-2 py-0.5 text-[9px] font-extrabold tracking-wide uppercase ${PRIORITY_COLORS[task.priority] ?? ''}`}>
              {task.priority}
            </span>
          )}
          {task.blocked && (
            <span className="rounded-md bg-rose-50 border border-rose-100 px-2 py-0.5 text-[9px] font-extrabold text-rose-600 uppercase tracking-wide flex items-center gap-0.5 animate-pulse">
              <span>🚫</span> Blocked
            </span>
          )}
        </div>

        <div className="min-w-0">
          <p className={`text-sm font-bold text-slate-800 tracking-tight leading-snug ${task.done ? 'line-through text-slate-400' : ''}`}>
            {task.title}
          </p>
          
          {task.blocked && task.blockedReason && (
            <div className="mt-2.5 rounded-xl border border-rose-100 bg-rose-50/30 px-3 py-2 text-xs font-semibold text-rose-700 leading-normal">
              <span className="font-bold uppercase tracking-wider text-[9px] text-rose-600 block mb-0.5">Blocker Reason</span>
              {task.blockedReason}
            </div>
          )}
          
          {task.epicName && (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: task.epicColor || '#6366f1' }} />
              <span className="truncate">{task.epicName}</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-slate-100/80 pt-3.5 text-xs text-slate-500 font-medium">
          <span className="font-mono bg-slate-50 border border-slate-100/60 rounded-md px-2 py-0.5">{task.myHours}h committed</span>
          <span className="rounded-lg bg-indigo-50/80 border border-indigo-100/50 px-2.5 py-0.5 font-bold text-indigo-600 text-[10px]">
            ~{task.dailyTarget}h / day
          </span>
        </div>
      </div>
    </div>
  );
}

function TaskSections({
  currentSprintTasks,
  todayFocus,
  upcomingTasks,
}: {
  currentSprintTasks: MyWorkTaskDto[];
  todayFocus: MyWorkTaskDto[];
  upcomingTasks: MyWorkTaskDto[];
}) {
  const pendingFocus = todayFocus.filter((t) => !t.done && !t.blocked);
  const p0Tasks = currentSprintTasks.filter((t) => t.priority === 'P0' && !t.done && !t.blocked);
  const p1Tasks = currentSprintTasks.filter((t) => t.priority === 'P1' && !t.done && !t.blocked);
  const p2Tasks = currentSprintTasks.filter((t) => t.priority === 'P2' && !t.done && !t.blocked);
  const blockedTasks = currentSprintTasks.filter((t) => t.blocked && !t.done);
  const doneTasks = currentSprintTasks.filter((t) => t.done);

  const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  blockedTasks.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority ?? 'P2'] ?? 2) -
      (PRIORITY_ORDER[b.priority ?? 'P2'] ?? 2)
  );

  if (currentSprintTasks.length === 0 && upcomingTasks.length === 0) {
    return (
      <p className="text-xs text-slate-400 italic py-2">No tasks assigned this sprint.</p>
    );
  }

  return (
    <div className="space-y-6">
      {pendingFocus.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-[10px] shadow-sm">⚡</span>
            Today's Focus
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingFocus.map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {blockedTasks.length > 0 && (
        <section className="rounded-xl border border-rose-200/60 bg-rose-50/10 p-4 space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-bold text-rose-700 uppercase tracking-wider">
            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-rose-500 text-white text-[10px] shadow-sm">🚫</span>
            Blocked ({blockedTasks.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {blockedTasks.map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {p0Tasks.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
            <span className="rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-black text-red-600">P0</span>
            Must Ship
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p0Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {p1Tasks.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wider">
            <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-600">P1</span>
            Should Ship
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {p1Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {p2Tasks.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200/80 p-4">
          <details className="group/details">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider select-none">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-slate-500">P2</span>
                Nice-to-have ({p2Tasks.length})
              </div>
              <svg className="h-3.5 w-3.5 text-slate-400 group-open/details:rotate-180 transition-transform duration-250" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
              {p2Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </details>
        </section>
      )}

      {upcomingTasks.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Upcoming</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
            {upcomingTasks.slice(0, 6).map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {doneTasks.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200/80 p-4">
          <details className="group/details">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider select-none">
              <span>Completed ({doneTasks.length})</span>
              <svg className="h-3.5 w-3.5 text-slate-400 group-open/details:rotate-180 transition-transform duration-250" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-60 animate-fade-in">
              {doneTasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function MemberWorkSection({ memberWork }: { memberWork: MemberWorkSummaryDto }) {
  const total = memberWork.currentSprintTasks.length;
  const done = memberWork.currentSprintTasks.filter((t) => t.done).length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 text-sm font-extrabold">
            {memberWork.member.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{memberWork.member.name}</p>
            <p className="text-[10px] text-slate-400 font-medium capitalize">{memberWork.member.role.toLowerCase()}</p>
          </div>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{done}/{total}</span>
            <span className="text-slate-300">·</span>
            <span className="rounded-full bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 font-bold text-indigo-600 text-[10px]">{rate}%</span>
          </div>
        )}
      </div>
      <div className="px-6 py-5">
        <TaskSections
          currentSprintTasks={memberWork.currentSprintTasks}
          todayFocus={memberWork.todayFocus}
          upcomingTasks={memberWork.upcomingTasks}
        />
      </div>
    </section>
  );
}

function MyWorkContent({ data }: { data: MyWorkDto }) {
  const totalMyTasks = data.currentSprintTasks.length;
  const completedMyTasks = data.currentSprintTasks.filter((t) => t.done).length;
  const completionRate = totalMyTasks > 0 ? Math.round((completedMyTasks / totalMyTasks) * 100) : 0;

  const isAdmin = data.isAdmin;

  // For admin: compute aggregate totals across all members
  const allMembersWork = data.allMembersWork ?? [];
  const adminTotalTasks = isAdmin
    ? allMembersWork.reduce((sum, m) => sum + m.currentSprintTasks.length, 0)
    : totalMyTasks;
  const adminDoneTasks = isAdmin
    ? allMembersWork.reduce((sum, m) => sum + m.currentSprintTasks.filter((t) => t.done).length, 0)
    : completedMyTasks;
  const adminRate = adminTotalTasks > 0 ? Math.round((adminDoneTasks / adminTotalTasks) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-50/30 blur-3xl" />

        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            {isAdmin ? 'Admin View' : 'My Dashboard'}
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {isAdmin ? 'Team Work' : 'My Work'}
          </h1>
          {data.currentSprint && (
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Active Sprint:{' '}
              <span className="font-semibold text-slate-800">{data.currentSprint.name}</span>
              {' '}·{' '}
              <span className="rounded-full bg-indigo-50/80 px-2 py-0.5 font-bold text-indigo-600 text-[10px] border border-indigo-100/50">
                {data.daysRemaining} day{data.daysRemaining !== 1 ? 's' : ''} left
              </span>
            </p>
          )}
        </div>

        {adminTotalTasks > 0 && (
          <div className="relative flex items-center gap-4 bg-slate-50/60 border border-slate-200/60 rounded-2xl px-5 py-3 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
                {isAdmin ? 'Team Progress' : 'My Progress'}
              </span>
              <span className="text-sm font-black text-slate-800">{adminDoneTasks} / {adminTotalTasks} tasks done</span>
            </div>
            <div className="relative h-12 w-12 flex-shrink-0 flex items-center justify-center">
              <svg className="h-full w-full transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="#f1f5f9" strokeWidth="4" fill="transparent" />
                <circle cx="24" cy="24" r="20" stroke="#6366f1" strokeWidth="4" fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - adminRate / 100)}`}
                  strokeLinecap="round" />
              </svg>
              <span className="absolute text-[10px] font-extrabold text-indigo-600">{adminRate}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 px-8 py-8 max-w-[1400px] w-full mx-auto">
        {isAdmin ? (
          // Admin: show each team member's work in separate cards
          <div className="space-y-6">
            {allMembersWork.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No team members found in this project.</p>
            ) : (
              allMembersWork.map((mw) => (
                <MemberWorkSection key={mw.member.id} memberWork={mw} />
              ))
            )}
          </div>
        ) : (
          // Regular user: show their own tasks
          <TaskSections
            currentSprintTasks={data.currentSprintTasks}
            todayFocus={data.todayFocus}
            upcomingTasks={data.upcomingTasks}
          />
        )}
      </div>
    </div>
  );
}

export default function MyWorkPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-work', activeProjectId],
    queryFn: () => getMyWork(activeProjectId!),
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
        <p className="text-xs text-slate-400 mt-1 max-w-xs">Select a project in the sidebar switcher to view your work.</p>
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-200/80" />
          ))}
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
        <p className="text-base font-bold text-slate-800">Failed to load your work</p>
        <p className="text-xs text-slate-400 mt-1">Please try refreshing or choosing a different project.</p>
      </div>
    );
  }

  return <MyWorkContent data={data} />;
}
