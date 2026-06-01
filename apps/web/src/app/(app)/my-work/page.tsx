'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getMyWork } from '@/lib/api/projects';
import type { MyWorkDto, MyWorkTaskDto } from '@sprintflow/shared';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-500',
};

function TaskCard({ task }: { task: MyWorkTaskDto }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 ${task.done ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {task.priority && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRIORITY_COLORS[task.priority] ?? ''}`}>
              {task.priority}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium text-slate-800 ${task.done ? 'line-through' : ''}`}>
            {task.title}
          </p>
          {task.epicName && (
            <p className="mt-0.5 text-xs text-slate-400">{task.epicName}</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span className="font-mono">{task.myHours}h assigned</span>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-600">
          ~{task.dailyTarget}h/day
        </span>
      </div>
    </div>
  );
}

function MyWorkContent({ data }: { data: MyWorkDto }) {
  const pendingFocus = data.todayFocus.filter((t) => !t.done);
  const p0Tasks = data.currentSprintTasks.filter((t) => t.priority === 'P0' && !t.done);
  const p1Tasks = data.currentSprintTasks.filter((t) => t.priority === 'P1' && !t.done);
  const p2Tasks = data.currentSprintTasks.filter((t) => t.priority === 'P2' && !t.done);
  const doneTasks = data.currentSprintTasks.filter((t) => t.done);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-slate-900">My Work</h1>
        {data.currentSprint && (
          <p className="mt-0.5 text-sm text-slate-500">
            {data.currentSprint.name} · {data.daysRemaining} day{data.daysRemaining !== 1 ? 's' : ''} remaining
          </p>
        )}
      </div>

      <div className="flex-1 px-6 py-6 space-y-8">
        {/* Today's focus */}
        {pendingFocus.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">⚡</span>
              Today's focus
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pendingFocus.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* P0 */}
        {p0Tasks.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="rounded px-1.5 py-0.5 bg-red-100 text-[10px] font-bold text-red-700">P0</span>
              Must ship
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p0Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* P1 */}
        {p1Tasks.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span className="rounded px-1.5 py-0.5 bg-amber-100 text-[10px] font-bold text-amber-700">P1</span>
              Should ship
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {p1Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {/* P2 */}
        {p2Tasks.length > 0 && (
          <section>
            <details>
              <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="rounded px-1.5 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-500">P2</span>
                Nice-to-have ({p2Tasks.length})
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {p2Tasks.map((t) => <TaskCard key={t.id} task={t} />)}
              </div>
            </details>
          </section>
        )}

        {/* Upcoming */}
        {data.upcomingTasks.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-400">Upcoming sprints</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
              {data.upcomingTasks.slice(0, 6).map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          </section>
        )}

        {doneTasks.length > 0 && (
          <section>
            <details>
              <summary className="mb-2 cursor-pointer list-none text-xs font-medium text-slate-400">
                {doneTasks.length} completed
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 opacity-50">
                {doneTasks.map((t) => <TaskCard key={t.id} task={t} />)}
              </div>
            </details>
          </section>
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
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a project first.</div>;
  }
  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>;
  }
  if (isError || !data) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Failed to load your work.</div>;
  }

  return <MyWorkContent data={data} />;
}
