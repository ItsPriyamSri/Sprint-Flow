'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getMyWork } from '@/lib/api/projects';
import type { MyWorkDto, MyWorkTaskDto, MemberWorkSummaryDto } from '@sprintflow/shared';

// ─── Status derivation ────────────────────────────────────────────────────────

type ColStatus = 'in-progress' | 'review' | 'done' | 'todo';

function getColStatus(task: MyWorkTaskDto): ColStatus {
  if (task.done) return 'done';
  const col = task.columnName?.toLowerCase() ?? '';
  if (/in[\s-]?progress|doing|active|working/i.test(col)) return 'in-progress';
  if (/review|qa|testing|feedback|check/i.test(col)) return 'review';
  return 'todo';
}

const STATUS_CONFIG: Record<ColStatus, { label: string; dotCls: string; badgeCls: string; pulse: boolean }> = {
  'in-progress': { label: 'In Progress', dotCls: 'bg-blue-500',    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',       pulse: true  },
  'review':      { label: 'In Review',   dotCls: 'bg-amber-500',   badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',    pulse: false },
  'todo':        { label: 'To Do',       dotCls: 'bg-slate-400',   badgeCls: 'bg-slate-50 text-slate-600 border-slate-200',    pulse: false },
  'done':        { label: 'Done',        dotCls: 'bg-emerald-500', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200', pulse: false },
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-50 text-red-700 border-red-200',
  P1: 'bg-amber-50 text-amber-700 border-amber-200',
  P2: 'bg-slate-50 text-slate-600 border-slate-200',
};

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: MyWorkTaskDto }) {
  const status = getColStatus(task);
  const { label, dotCls, badgeCls, pulse } = STATUS_CONFIG[status];

  return (
    <div
      className={[
        'group flex flex-col rounded-xl border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-px',
        task.done   ? 'opacity-55' : '',
        task.blocked ? 'border-rose-200 bg-rose-50/20 hover:border-rose-300' : 'border-slate-200/80 hover:border-indigo-200',
      ].join(' ')}
    >
      {/* Badge row */}
      <div className="flex flex-wrap items-center gap-1.5">
        {task.priority && (
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${PRIORITY_COLORS[task.priority] ?? ''}`}>
            {task.priority}
          </span>
        )}
        <span className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${task.blocked ? 'bg-rose-50 text-rose-700 border-rose-200' : badgeCls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${task.blocked ? 'bg-rose-500 animate-pulse' : dotCls} ${pulse && !task.blocked ? 'animate-pulse' : ''}`} />
          {task.blocked ? 'Blocked' : label}
        </span>
        {task.sprintName && (
          <span className="rounded border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">
            {task.sprintName}
          </span>
        )}
      </div>

      {/* Title */}
      <p className={`mt-2.5 text-sm font-semibold leading-snug line-clamp-2 flex-1 ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
        {task.title}
      </p>

      {/* Blocker reason */}
      {task.blocked && task.blockedReason && (
        <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50/40 px-2.5 py-1.5 text-[10px] leading-relaxed text-rose-700">
          <span className="block font-extrabold uppercase tracking-wider text-[8px] text-rose-500 mb-0.5">Blocker</span>
          {task.blockedReason}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.epicName ? (
            <>
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: task.epicColor ?? '#6366f1' }} />
              <span className="truncate text-[10px] font-medium text-slate-500">{task.epicName}</span>
            </>
          ) : (
            <span className="text-[10px] text-slate-300">No epic</span>
          )}
        </div>
        {task.myHours > 0 && (
          <span className="flex-shrink-0 rounded border border-indigo-100/60 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
            ~{task.dailyTarget}h/day
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  label, count, accent = 'default', faded = false,
}: {
  label: string;
  count: number;
  accent?: 'default' | 'active' | 'review' | 'blocked' | 'done';
  faded?: boolean;
}) {
  const accentCls: Record<string, string> = {
    default: 'text-slate-600',
    active:  'text-blue-700',
    review:  'text-amber-700',
    blocked: 'text-rose-700',
    done:    'text-emerald-700',
  };
  const countCls: Record<string, string> = {
    default: 'bg-slate-100 text-slate-500',
    active:  'bg-blue-100 text-blue-700',
    review:  'bg-amber-100 text-amber-700',
    blocked: 'bg-rose-100 text-rose-700',
    done:    'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className={`flex items-center gap-2 ${faded ? 'opacity-60' : ''}`}>
      <h3 className={`text-xs font-extrabold uppercase tracking-widest ${accentCls[accent]}`}>{label}</h3>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${countCls[accent]}`}>{count}</span>
    </div>
  );
}

// ─── Task sections (column-status-based) ─────────────────────────────────────

function TaskSections({
  currentSprintTasks,
  upcomingTasks,
}: {
  currentSprintTasks: MyWorkTaskDto[];
  upcomingTasks: MyWorkTaskDto[];
}) {
  const inProgress = currentSprintTasks.filter((t) => !t.done && !t.blocked && getColStatus(t) === 'in-progress');
  const inReview   = currentSprintTasks.filter((t) => !t.done && !t.blocked && getColStatus(t) === 'review');
  const blocked    = currentSprintTasks.filter((t) => t.blocked && !t.done);
  const todo       = currentSprintTasks.filter((t) => !t.done && !t.blocked && getColStatus(t) === 'todo');
  const done       = currentSprintTasks.filter((t) => t.done);

  if (currentSprintTasks.length === 0 && upcomingTasks.length === 0) {
    return <p className="text-xs italic text-slate-400 py-4">No tasks assigned this sprint.</p>;
  }

  const grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="space-y-8">
      {inProgress.length > 0 && (
        <section className="space-y-3">
          <SectionHeader label="Working On" count={inProgress.length} accent="active" />
          <div className={grid}>{inProgress.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        </section>
      )}

      {inReview.length > 0 && (
        <section className="space-y-3">
          <SectionHeader label="In Review" count={inReview.length} accent="review" />
          <div className={grid}>{inReview.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        </section>
      )}

      {blocked.length > 0 && (
        <section className="space-y-3">
          <SectionHeader label="Blocked" count={blocked.length} accent="blocked" />
          <div className={grid}>{blocked.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        </section>
      )}

      {todo.length > 0 && (
        <section className="space-y-3">
          <SectionHeader label="Up Next" count={todo.length} />
          <div className={grid}>{todo.map((t) => <TaskCard key={t.id} task={t} />)}</div>
        </section>
      )}

      {upcomingTasks.length > 0 && (
        <section className="space-y-3">
          <SectionHeader label="Upcoming" count={upcomingTasks.length} faded />
          <div className={`${grid} opacity-50`}>
            {upcomingTasks.slice(0, 8).map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <details className="group/done">
            <summary className="flex cursor-pointer list-none select-none items-center gap-2 hover:opacity-80">
              <SectionHeader label="Completed" count={done.length} accent="done" />
              <svg className="h-3 w-3 text-slate-400 transition-transform group-open/done:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </summary>
            <div className={`mt-3 ${grid} animate-fade-in`}>
              {done.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

// ─── Admin: per-member card ───────────────────────────────────────────────────

function MemberWorkSection({ memberWork }: { memberWork: MemberWorkSummaryDto }) {
  const total = memberWork.currentSprintTasks.length;
  const doneCount = memberWork.currentSprintTasks.filter((t) => t.done).length;
  const rate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const initials = memberWork.member.name.slice(0, 2).toUpperCase();
  const inProgress = memberWork.currentSprintTasks.filter((t) => !t.done && getColStatus(t) === 'in-progress').length;
  const blocked = memberWork.currentSprintTasks.filter((t) => t.blocked && !t.done).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      {/* Member header */}
      <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50/40 px-6 py-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-extrabold text-white shadow-sm">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900">{memberWork.member.name}</p>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
              {memberWork.member.role}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500">
            <span>{total} task{total !== 1 ? 's' : ''} this sprint</span>
            {inProgress > 0 && (
              <span className="flex items-center gap-1 font-semibold text-blue-600">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                {inProgress} in progress
              </span>
            )}
            {blocked > 0 && (
              <span className="font-semibold text-rose-600">{blocked} blocked</span>
            )}
          </div>
        </div>
        {total > 0 && (
          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-800">{doneCount}/{total}</p>
              <p className="text-[10px] font-medium text-slate-400">done</p>
            </div>
            <div className="relative h-11 w-11">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" stroke="#f1f5f9" strokeWidth="4" fill="transparent" />
                <circle
                  cx="22" cy="22" r="18"
                  stroke={rate === 100 ? '#10b981' : '#6366f1'}
                  strokeWidth="4" fill="transparent"
                  strokeDasharray={`${2 * Math.PI * 18}`}
                  strokeDashoffset={`${2 * Math.PI * 18 * (1 - rate / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-indigo-600">
                {rate}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1 w-full bg-slate-100">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${rate}%`, backgroundColor: rate === 100 ? '#10b981' : '#6366f1' }}
          />
        </div>
      )}

      <div className="px-6 py-5">
        <TaskSections
          currentSprintTasks={memberWork.currentSprintTasks}
          upcomingTasks={memberWork.upcomingTasks}
        />
      </div>
    </section>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function MyWorkContent({ data }: { data: MyWorkDto }) {
  const isLead = data.isLead;
  const allMembersWork = data.allMembersWork ?? [];

  const totalMyTasks = data.currentSprintTasks.length;
  const doneMyTasks  = data.currentSprintTasks.filter((t) => t.done).length;
  const myRate       = totalMyTasks > 0 ? Math.round((doneMyTasks / totalMyTasks) * 100) : 0;

  const adminTotal = isLead
    ? allMembersWork.reduce((s, m) => s + m.currentSprintTasks.length, 0)
    : totalMyTasks;
  const adminDone = isLead
    ? allMembersWork.reduce((s, m) => s + m.currentSprintTasks.filter((t) => t.done).length, 0)
    : doneMyTasks;
  const adminRate = adminTotal > 0 ? Math.round((adminDone / adminTotal) * 100) : 0;

  const displayTotal = isLead ? adminTotal : totalMyTasks;
  const displayDone  = isLead ? adminDone  : doneMyTasks;
  const displayRate  = isLead ? adminRate  : myRate;

  const myInProgress = data.currentSprintTasks.filter((t) => !t.done && getColStatus(t) === 'in-progress').length;
  const myBlocked    = data.currentSprintTasks.filter((t) => t.blocked && !t.done).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 px-8 py-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          {/* Left: identity */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-extrabold text-white shadow-sm">
              {(data.member.name || 'MY').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight text-slate-900">
                  {isLead ? 'Team Work' : 'My Work'}
                </h1>
                {isLead && (
                  <span className="flex-shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-600">
                    Lead
                  </span>
                )}
              </div>
              {data.currentSprint && (
                <p className="truncate text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{data.currentSprint.name}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="text-indigo-600">{data.daysRemaining}d left</span>
                </p>
              )}
            </div>
          </div>

          {/* Right: stats row */}
          <div className="flex flex-shrink-0 items-center gap-3">
            {!isLead && myInProgress > 0 && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-bold text-blue-700">{myInProgress} active</span>
              </div>
            )}
            {!isLead && myBlocked > 0 && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span className="text-xs font-bold text-rose-700">{myBlocked} blocked</span>
              </div>
            )}
            {displayTotal > 0 && (
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="relative h-9 w-9 flex-shrink-0">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" stroke="#f1f5f9" strokeWidth="3.5" fill="transparent" />
                    <circle
                      cx="18" cy="18" r="14"
                      stroke={displayRate === 100 ? '#10b981' : '#6366f1'}
                      strokeWidth="3.5" fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 14}`}
                      strokeDashoffset={`${2 * Math.PI * 14 * (1 - displayRate / 100)}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-extrabold text-indigo-600">
                    {displayRate}%
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Progress</p>
                  <p className="text-xs font-black text-slate-800">{displayDone}/{displayTotal}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-8 py-8 w-full max-w-[1400px] mx-auto">
        {isLead ? (
          <div className="space-y-6">
            {allMembersWork.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No team members found in this project.</p>
            ) : (
              allMembersWork.map((mw) => (
                <MemberWorkSection key={mw.member.id} memberWork={mw} />
              ))
            )}
          </div>
        ) : (
          <TaskSections
            currentSprintTasks={data.currentSprintTasks}
            upcomingTasks={data.upcomingTasks}
          />
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyWorkPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-work', activeProjectId],
    queryFn:  () => getMyWork(activeProjectId!),
    enabled:  !!activeProjectId,
    staleTime: 30_000,
  });

  if (!activeProjectId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
        <div className="mb-4 flex h-16 w-16 animate-bounce items-center justify-center rounded-2xl border border-slate-200/60 bg-white shadow-md">
          <span className="text-2xl">📁</span>
        </div>
        <p className="text-base font-bold text-slate-800">No active project selected</p>
        <p className="mt-1 max-w-xs text-xs text-slate-400">Select a project in the sidebar switcher to view your work.</p>
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-slate-200/80" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-500 shadow-sm">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="text-base font-bold text-slate-800">Failed to load your work</p>
        <p className="mt-1 text-xs text-slate-400">Please try refreshing or choosing a different project.</p>
      </div>
    );
  }

  return <MyWorkContent data={data} />;
}
