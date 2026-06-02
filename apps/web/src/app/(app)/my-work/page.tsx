'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { useAuthStore } from '@/store/auth.store';
import { getMyWork } from '@/lib/api/projects';
import type { MyWorkDto, MyWorkTaskDto } from '@sprintflow/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── TaskCard ────────────────────────────────────────────────────────────────

function TaskCard({ task, showAssignee }: { task: MyWorkTaskDto; showAssignee?: boolean }) {
  const priorityRibbon = task.priority ? PRIORITY_RIBBONS[task.priority] : 'bg-slate-200';
  const cardBorder = task.blocked
    ? 'border-red-200 bg-red-50/5 hover:shadow-[0_8px_30px_rgba(244,63,94,0.04)] hover:border-red-300'
    : 'border-slate-200/70 bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.025)] hover:border-slate-300';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 pl-6 transition-all duration-300 ease-out hover:-translate-y-1 ${cardBorder} ${task.done ? 'opacity-55' : ''}`}
    >
      {/* Priority accent side ribbon */}
      <span className={`absolute left-0 top-0 bottom-0 w-[5px] ${priorityRibbon}`} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
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
          {showAssignee && task.assigneeName && (
            <span className="ml-auto rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600">
              {task.assigneeName}
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
          <span className="font-mono bg-slate-50 border border-slate-100/60 rounded-md px-2 py-0.5">{task.myHours}h</span>
          <span className="rounded-lg bg-indigo-50/80 border border-indigo-100/50 px-2.5 py-0.5 font-bold text-indigo-600 text-[10px]">
            ~{task.dailyTarget}h / day
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Mini progress ring ───────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative h-12 w-12 flex-shrink-0 flex items-center justify-center">
      <svg className="h-full w-full transform -rotate-90">
        <circle cx="24" cy="24" r={r} stroke="#f1f5f9" strokeWidth="4" fill="transparent" />
        <circle
          cx="24" cy="24" r={r} stroke="#6366f1" strokeWidth="4" fill="transparent"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${circ * (1 - pct / 100)}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-[10px] font-extrabold text-indigo-600">{pct}%</span>
    </div>
  );
}

// ─── Member section (admin view) ──────────────────────────────────────────────

function MemberSection({ name, tasks, daysRemaining }: { name: string; tasks: MyWorkTaskDto[]; daysRemaining: number }) {
  const done = tasks.filter((t) => t.done).length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const active = tasks.filter((t) => !t.done && !t.blocked);
  const blocked = tasks.filter((t) => t.blocked && !t.done);
  const completed = tasks.filter((t) => t.done);

  void daysRemaining;

  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 font-black text-sm">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-black text-slate-800">{name}</p>
            <p className="text-[10px] text-slate-400 font-medium">{total} task{total !== 1 ? 's' : ''} this sprint</p>
          </div>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Progress</p>
              <p className="text-xs font-black text-slate-700">{done}/{total} done</p>
            </div>
            <ProgressRing pct={pct} />
          </div>
        )}
      </div>

      <div className="p-5 space-y-5">
        {blocked.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-[10px] font-extrabold text-rose-600 uppercase tracking-widest">
              <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-rose-500 text-white text-[9px]">🚫</span>
              Blocked ({blocked.length})
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {blocked.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </div>
        )}

        {active.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Active</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </div>
        )}

        {completed.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest select-none">
              <svg className="h-3 w-3 group-open:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Completed ({completed.length})
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-55">
              {completed.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </details>
        )}

        {active.length === 0 && blocked.length === 0 && completed.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No tasks assigned this sprint.</p>
        )}
      </div>
    </section>
  );
}

// ─── Admin view (all team) ────────────────────────────────────────────────────

function AdminWorkContent({ data }: { data: MyWorkDto }) {
  // Group tasks by assigneeName
  const groupMap = new Map<string, MyWorkTaskDto[]>();
  for (const t of data.currentSprintTasks) {
    const name = t.assigneeName ?? 'Unassigned';
    if (!groupMap.has(name)) groupMap.set(name, []);
    groupMap.get(name)!.push(t);
  }
  const groups = Array.from(groupMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  const totalTasks = data.currentSprintTasks.length;
  const doneTasks  = data.currentSprintTasks.filter((t) => t.done).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* Admin header */}
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="absolute right-0 top-0 -mr-12 -mt-12 h-56 w-56 rounded-full bg-violet-50/40 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-600">
            <span className="flex h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            Team Overview
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Team Work</h1>
          {data.currentSprint && (
            <p className="text-xs text-slate-500 font-medium">
              Sprint:{' '}
              <span className="font-semibold text-slate-800">{data.currentSprint.name}</span>
              {' '}·{' '}
              <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-600 text-[10px] border border-violet-100/50">
                {data.daysRemaining} day{data.daysRemaining !== 1 ? 's' : ''} left
              </span>
            </p>
          )}
        </div>

        {totalTasks > 0 && (
          <div className="relative flex items-center gap-4 bg-slate-50/60 border border-slate-200/60 rounded-2xl px-5 py-3 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Team Progress</span>
              <span className="text-sm font-black text-slate-800">{doneTasks} / {totalTasks} tasks done</span>
              <span className="text-[10px] text-slate-400">{groups.length} member{groups.length !== 1 ? 's' : ''}</span>
            </div>
            <ProgressRing pct={pct} />
          </div>
        )}
      </div>

      <div className="flex-1 px-8 py-8 space-y-5 max-w-[1400px] w-full mx-auto">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md border border-slate-200/60 mb-4">
              <span className="text-2xl">👥</span>
            </div>
            <p className="text-base font-bold text-slate-800">No tasks assigned this sprint</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">Assign tasks to team members to see their work here.</p>
          </div>
        ) : (
          groups.map(([name, tasks]) => (
            <MemberSection key={name} name={name} tasks={tasks} daysRemaining={data.daysRemaining} />
          ))
        )}

        {/* Upcoming (shared, shown for admin too) */}
        {data.upcomingTasks.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Upcoming sprints</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
              {data.upcomingTasks.slice(0, 6).map((t) => <TaskCard key={`${t.id}-${t.assigneeName}`} task={t} showAssignee />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Member view (own tasks) ──────────────────────────────────────────────────

function MyWorkContent({ data }: { data: MyWorkDto }) {
  const pendingFocus = data.todayFocus.filter((t) => !t.done && !t.blocked);
  const p0Tasks = data.currentSprintTasks.filter((t) => t.priority === 'P0' && !t.done && !t.blocked);
  const p1Tasks = data.currentSprintTasks.filter((t) => t.priority === 'P1' && !t.done && !t.blocked);
  const p2Tasks = data.currentSprintTasks.filter((t) => t.priority === 'P2' && !t.done && !t.blocked);
  const blockedTasks = data.currentSprintTasks.filter((t) => t.blocked && !t.done);
  const doneTasks = data.currentSprintTasks.filter((t) => t.done);

  const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  blockedTasks.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority ?? 'P2'] ?? 2) -
      (PRIORITY_ORDER[b.priority ?? 'P2'] ?? 2),
  );

  const totalMyTasks = data.currentSprintTasks.length;
  const completedMyTasks = doneTasks.length;
  const completionRate = totalMyTasks > 0 ? Math.round((completedMyTasks / totalMyTasks) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-50/30 blur-3xl" />

        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            My Dashboard
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">My Work</h1>
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

        {totalMyTasks > 0 && (
          <div className="relative flex items-center gap-4 bg-slate-50/60 border border-slate-200/60 rounded-2xl px-5 py-3 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">My Progress</span>
              <span className="text-sm font-black text-slate-800">{completedMyTasks} / {totalMyTasks} tasks done</span>
            </div>
            <ProgressRing pct={completionRate} />
          </div>
        )}
      </div>

      <div className="flex-1 px-8 py-8 space-y-9 max-w-[1400px] w-full mx-auto">
        {/* Today's focus */}
        {pendingFocus.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider">
              <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 text-xs shadow-sm">⚡</span>
              Today's Focus
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendingFocus.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* Blocked */}
        {blockedTasks.length > 0 && (
          <section className="rounded-2xl border border-rose-200/60 bg-rose-50/10 p-6 shadow-[0_2px_12px_rgba(244,63,94,0.01)] space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-rose-700 uppercase tracking-wider">
              <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-rose-500 text-white text-xs shadow-md">🚫</span>
              Blocked Tasks ({blockedTasks.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {blockedTasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* P0 */}
        {p0Tasks.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider">
              <span className="rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-black text-red-600 shadow-sm">P0</span>
              Must Ship
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {p0Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* P1 */}
        {p1Tasks.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider">
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-600 shadow-sm">P1</span>
              Should Ship
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {p1Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* P2 */}
        {p2Tasks.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
            <details className="group/details">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-700 uppercase tracking-wider select-none">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-black text-slate-500">P2</span>
                  Nice-to-have ({p2Tasks.length})
                </div>
                <svg className="h-4 w-4 text-slate-400 group-open/details:rotate-180 transition-transform duration-250" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {p2Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
              </div>
            </details>
          </section>
        )}

        {/* Upcoming */}
        {data.upcomingTasks.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Upcoming sprints</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
              {data.upcomingTasks.slice(0, 6).map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* Completed */}
        {doneTasks.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
            <details className="group/details">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider select-none">
                <span>Completed Tasks ({doneTasks.length})</span>
                <svg className="h-4 w-4 text-slate-400 group-open/details:rotate-180 transition-transform duration-250" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
                {doneTasks.map((t) => <TaskCard key={t.id} task={t} />)}
              </div>
            </details>
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyWorkPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const user = useAuthStore((s) => s.user);
  // Determine admin status from workspace role stored in the auth membership
  const wsRole = user?.memberships?.[0]?.role;
  const isAdmin = wsRole === 'ADMIN' || wsRole === 'OWNER';

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
        <p className="text-base font-bold text-slate-800">Failed to load work data</p>
        <p className="text-xs text-slate-400 mt-1">Please try refreshing or choosing a different project.</p>
      </div>
    );
  }

  // Use the server-authoritative flag (isAdminView) — falls back to client-side role check
  const showAdminView = data.isAdminView ?? isAdmin;

  return showAdminView ? <AdminWorkContent data={data} /> : <MyWorkContent data={data} />;
}
