'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { getActivity, describeActivity, timeAgo, type ActivityEntry } from '@/lib/api/activity';
import Link from 'next/link';

const ACTION_ICONS: Record<string, string> = {
  TASK_CREATED: '✨',
  TASK_DELETED: '🗑️',
  TASK_COMMENTED: '💬',
  TASK_MOVED: '➡️',
  TASK_UPDATED: '✏️',
  TASK_BLOCKED: '🚫',
  TASK_UNBLOCKED: '✅',
  IMPORT_COMMITTED: '📤',
  IMPORT_ROLLED_BACK: '↩️',
  SPRINT_CREATED: '📅',
  SPRINT_UPDATED: '⚙️',
  COLUMN_ADDED: '🧱',
  COLUMN_REORDERED: '↕️',
};

const ACTION_BG_CLASSES: Record<string, string> = {
  TASK_BLOCKED: 'bg-rose-50/40 border-rose-100 hover:border-rose-200 shadow-[0_4px_12px_rgba(244,63,94,0.015)]',
  TASK_UNBLOCKED: 'bg-emerald-50/20 border-emerald-100 hover:border-emerald-200 shadow-[0_4px_12px_rgba(16,185,129,0.015)]',
  TASK_CREATED: 'bg-indigo-50/10 border-indigo-100 hover:border-indigo-200',
  IMPORT_COMMITTED: 'bg-teal-50/15 border-teal-100 hover:border-teal-200',
};

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

export default function ActivityPage() {
  const workspaceId = useAuthStore((s) => s.defaultWorkspaceId) ?? '';
  const [cursor, setCursor] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<ActivityEntry[]>([]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['activity', workspaceId, cursor],
    queryFn: () => getActivity(workspaceId, { cursor: cursor || undefined, limit: 15 }),
    enabled: !!workspaceId,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (data?.data) {
      setAllEntries((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        const filtered = data.data.filter((e) => !ids.has(e.id));
        return [...prev, ...filtered];
      });
    }
  }, [data]);

  // Reset when workspace changes
  useEffect(() => {
    setAllEntries([]);
    setCursor(null);
  }, [workspaceId]);

  if (!workspaceId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md border border-slate-200/60 mb-4 animate-pulse">
          <span className="text-2xl">⚡</span>
        </div>
        <p className="text-base font-bold text-slate-800">Select workspace</p>
        <p className="text-xs text-slate-400 mt-1">Select a workspace in the sidebar switcher to view logs.</p>
      </div>
    );
  }

  const handleLoadMore = () => {
    if (data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50/30">
      {/* Premium Header Banner */}
      <div className="relative overflow-hidden border-b border-slate-200/80 bg-white px-8 py-6 shadow-sm">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-50/30 blur-3xl" />
        
        <div className="relative flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            Audit trail
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Workspace Activity</h1>
          <p className="text-xs text-slate-500 max-w-xl leading-relaxed">
            A chronological audit feed tracking all project creation, task movements, blocker changes, and comments inside this workspace.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-8 py-10">
        {isLoading && allEntries.length === 0 ? (
          <div className="space-y-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 w-1/4 rounded bg-slate-200" />
                  <div className="h-16 rounded-xl bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-500 border border-red-150 mb-3">
              <span className="text-lg">⚠️</span>
            </div>
            <p className="text-sm font-bold text-slate-800">Failed to load activity logs</p>
            <p className="text-xs text-slate-400 mt-1">Please check your connection and try again.</p>
          </div>
        ) : allEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 border border-slate-100">
              <svg className="h-7 w-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-700 mt-1">No activity logged yet</p>
            <p className="max-w-xs text-xs text-slate-400 leading-normal">
              Changes to board tasks, column orders, active sprints, or workbook imports will automatically populate this audit timeline.
            </p>
          </div>
        ) : (
          <div className="relative border-l-2 border-slate-200/80 ml-6 pl-8 space-y-6">
            {allEntries.map((entry) => {
              const icon = ACTION_ICONS[entry.action] ?? '•';
              const isTask = entry.entityType === 'Task';
              const isSprint = entry.entityType === 'Sprint';
              const cardClass = ACTION_BG_CLASSES[entry.action] ?? 'bg-white border-slate-200/70 hover:border-slate-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.02)]';

              return (
                <div key={entry.id} className="relative group/item">
                  {/* Glowing Timeline Marker with Action Icon */}
                  <span className="absolute -left-[45px] top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white border border-slate-200 text-xs shadow-sm group-hover/item:border-indigo-400 group-hover/item:shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all duration-300 ease-out select-none">
                    {icon}
                  </span>

                  {/* Activity Card */}
                  <div className={`rounded-2xl border p-5 transition-all duration-300 ease-out ${cardClass} group-hover/item:-translate-y-0.5`}>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 border-b border-slate-100/50 pb-2">
                      <div className="flex items-center gap-2">
                        {/* Elegant custom user initials bubble */}
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold shadow-sm ${getAvatarBgColor(entry.actor.id)}`}>
                          {initials(entry.actor.name)}
                        </div>
                        <span className="font-bold text-slate-700">{entry.actor.name}</span>
                      </div>
                      <span className="font-semibold text-slate-400/90">{timeAgo(entry.createdAt)}</span>
                    </div>

                    <p className="text-sm font-medium text-slate-700 leading-relaxed">
                      {describeActivity(entry)}
                    </p>

                    {/* Quick navigation link buttons with hover polish */}
                    {(isTask || isSprint) && (
                      <div className="mt-3 flex justify-end">
                        {isTask ? (
                          <Link
                            href={`/board?task=${entry.entityId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 transition-all"
                          >
                            <span>Inspect Task</span>
                            <span className="text-[10px]">↗</span>
                          </Link>
                        ) : (
                          <Link
                            href={`/sprints/${entry.entityId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 transition-all"
                          >
                            <span>View Sprint</span>
                            <span className="text-[10px]">↗</span>
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {data?.nextCursor && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={handleLoadMore}
                  className="rounded-xl border border-slate-200/80 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-all hover:text-slate-800 hover:border-slate-300 hover:shadow-md"
                >
                  Load older activity logs
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
