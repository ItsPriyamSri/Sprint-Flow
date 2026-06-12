'use client';

import { useId, useRef, useState } from 'react';
import type { ImportRow, PreviewResponse } from '@/lib/api/import';

const STATUS_STYLES = {
  VALID:     { dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700',  label: 'Valid' },
  WARNING:   { dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', label: 'Warning' },
  ERROR:     { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700',      label: 'Error' },
  SKIPPED:   { dot: 'bg-slate-300',  badge: 'bg-slate-100 text-slate-500',  label: 'Skipped' },
  COMMITTED: { dot: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700',    label: 'Committed' },
};

const NOTE_STYLES = {
  WARNING: {
    trigger:
      'border-yellow-300/90 bg-yellow-50/80 text-yellow-800 hover:border-yellow-400 hover:bg-yellow-100 hover:shadow-sm hover:shadow-yellow-100',
    tooltip: 'border-yellow-200 bg-yellow-50 text-yellow-900',
    icon: 'text-yellow-600',
  },
  ERROR: {
    trigger:
      'border-red-300/90 bg-red-50/80 text-red-800 hover:border-red-400 hover:bg-red-100 hover:shadow-sm hover:shadow-red-100',
    tooltip: 'border-red-200 bg-red-50 text-red-900',
    icon: 'text-red-600',
  },
  VALID: {
    trigger: '',
    tooltip: '',
    icon: '',
  },
  SKIPPED: {
    trigger: '',
    tooltip: '',
    icon: '',
  },
  COMMITTED: {
    trigger: '',
    tooltip: '',
    icon: '',
  },
} as const;

function RowValidationStatus({ row }: { row: ImportRow }) {
  const tooltipId = useId();
  const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.SKIPPED;
  const noteStyle = NOTE_STYLES[row.status as keyof typeof NOTE_STYLES] ?? NOTE_STYLES.WARNING;
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const hasNotes = messages.length > 0;
  const noteLabel = `${messages.length} note${messages.length > 1 ? 's' : ''}`;

  return (
    <div className="flex min-w-[7.5rem] flex-col gap-1.5">
      <span
        className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-shadow duration-300 ${style.badge} ${
          hasNotes && row.status === 'WARNING' ? 'validation-badge-pulse' : ''
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {style.label}
      </span>

      {hasNotes && (
        <div className="group/note relative w-fit">
          <button
            type="button"
            aria-describedby={tooltipId}
            aria-label={`${noteLabel}: hover or focus for details`}
            className={`inline-flex cursor-help items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[10px] font-medium transition-all duration-200 ease-out hover:scale-[1.03] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 group-hover/note:scale-[1.03] ${noteStyle.trigger}`}
          >
            <span
              className={`inline-block transition-transform duration-200 group-hover/note:rotate-12 group-hover/note:scale-110 group-focus-visible/note:rotate-12 group-focus-visible/note:scale-110 ${noteStyle.icon}`}
              aria-hidden
            >
              ⚠
            </span>
            <span>{noteLabel}</span>
            <span
              className={`text-[9px] opacity-60 transition-all duration-200 group-hover/note:translate-x-0.5 group-hover/note:opacity-100 group-focus-visible/note:translate-x-0.5 group-focus-visible/note:opacity-100 validation-hint-nudge ${noteStyle.icon}`}
              aria-hidden
            >
              →
            </span>
          </button>

          <div
            id={tooltipId}
            role="tooltip"
            className={`pointer-events-none invisible absolute bottom-[calc(100%+6px)] left-0 z-30 w-64 rounded-lg border px-3 py-2 text-[11px] leading-snug shadow-lg opacity-0 transition-[visibility,opacity,transform] duration-200 ease-out group-hover/note:visible group-hover/note:opacity-100 group-hover/note:validation-tooltip-in group-focus-within/note:visible group-focus-within/note:opacity-100 group-focus-within/note:validation-tooltip-in ${noteStyle.tooltip}`}
          >
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide opacity-70">
              Validation details
            </p>
            <ul className="space-y-1">
              {messages.map((message, index) => (
                <li key={`${message.field ?? 'msg'}-${index}`} className="flex gap-1.5">
                  <span className="shrink-0 opacity-60">•</span>
                  <span>{message.message}</span>
                </li>
              ))}
            </ul>
            <span
              className={`absolute -bottom-1.5 left-3 h-2.5 w-2.5 rotate-45 border-b border-r ${noteStyle.tooltip}`}
              aria-hidden
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  preview: PreviewResponse;
  targetProjectName?: string | null;
  canCommit?: boolean;
  onCommit: (newProjectName?: string) => void;
  onBack: () => void;
  loading: boolean;
  error?: string | null;
}

type FilterKey = 'ALL' | 'VALID' | 'WARNING' | 'ERROR' | 'SKIPPED';

export function Step3Preview({
  preview,
  targetProjectName,
  canCommit: canCommitProject = true,
  onCommit,
  onBack,
  loading,
  error,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [projectMode, setProjectMode] = useState<'existing' | 'new'>(
    canCommitProject ? 'existing' : 'new',
  );
  const [newProjectName, setNewProjectName] = useState('');
  const newProjectInputRef = useRef<HTMLInputElement>(null);
  const stats = preview.import.stats;

  const displayRows = preview.rows.filter(
    (r) => filter === 'ALL' || r.status === filter,
  );

  const hasRows = (stats?.valid ?? 0) + (stats?.warnings ?? 0) > 0;
  const projectReady =
    projectMode === 'existing' ? canCommitProject : newProjectName.trim().length > 0;
  const canCommit = hasRows && projectReady;
  const sprintCount = typeof stats?.sprints === 'number' ? stats.sprints : 0;
  const epicCount = typeof stats?.epics === 'number' ? stats.epics : 0;
  const ownerCount = typeof stats?.owners === 'number' ? stats.owners : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Preview import</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review the rows below before committing. Errors will be skipped; warnings are imported with a flag.
        </p>
      </div>

      {/* Project target */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Import destination</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canCommitProject}
            onClick={() => setProjectMode('existing')}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              projectMode === 'existing'
                ? 'border-indigo-500 bg-white text-indigo-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            {targetProjectName ? (
              <span>Use <span className="font-semibold">{targetProjectName}</span></span>
            ) : (
              <span className="text-slate-400">No existing project</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setProjectMode('new');
              setTimeout(() => newProjectInputRef.current?.focus(), 50);
            }}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              projectMode === 'new'
                ? 'border-indigo-500 bg-white text-indigo-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            + Create new project
          </button>
        </div>
        {projectMode === 'new' && (
          <input
            ref={newProjectInputRef}
            type="text"
            placeholder="New project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
          />
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total rows', value: stats.total, color: 'text-slate-700' },
            { label: 'Valid', value: stats.valid, color: 'text-green-600' },
            { label: 'Warnings', value: stats.warnings, color: 'text-yellow-600' },
            { label: 'Errors', value: stats.errors, color: 'text-red-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div className="flex gap-4 text-sm text-slate-600">
          <span>🗓 {sprintCount} sprint{sprintCount !== 1 ? 's' : ''}</span>
          <span>🏷 {epicCount} epic{epicCount !== 1 ? 's' : ''}</span>
          <span>👤 {ownerCount} owner{ownerCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['ALL', 'VALID', 'WARNING', 'ERROR', 'SKIPPED'] as FilterKey[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f === 'ALL' ? 'All' : STATUS_STYLES[f as keyof typeof STATUS_STYLES]?.label}
          </button>
        ))}
      </div>

      {/* Rows table */}
      <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">
                <span>Status</span>
                {(stats?.warnings ?? 0) + (stats?.errors ?? 0) > 0 && (
                  <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                    Hover notes for details
                  </span>
                )}
              </th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Sprint</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No rows match this filter
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const n = row.normalized as Record<string, unknown>;
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-400">{row.rowIndex + 1}</td>
                    <td className="px-3 py-2">
                      <RowValidationStatus row={row} />
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">{String(n['externalId'] ?? '')}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-medium text-slate-800">{String(n['title'] ?? '')}</td>
                    <td className="px-3 py-2 text-slate-500">{String(n['sprintName'] ?? '')}</td>
                    <td className="px-3 py-2 text-slate-500">{String(n['ownerName'] ?? '')}</td>
                    <td className="px-3 py-2 text-slate-500">{String(n['priority'] ?? '')}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-slate-400">{String(n['notes'] ?? '')}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          ← Edit mapping
        </button>
        <button
          onClick={() => onCommit(projectMode === 'new' ? newProjectName.trim() : undefined)}
          disabled={!canCommit || loading}
          className="flex-[2] rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Importing…' : `Import ${(stats?.valid ?? 0) + (stats?.warnings ?? 0)} tasks →`}
        </button>
      </div>
    </div>
  );
}
