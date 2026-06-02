'use client';

import { useState } from 'react';
import { createSprint } from '@/lib/api/sprints';
import { Button } from '@sprintflow/ui';
import { Spinner } from '@sprintflow/ui';
import type { SprintDto } from '@sprintflow/shared';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  projectId: string;
  onSuccess?: (sprint: SprintDto) => void;
}

export function SprintCreateModal({ isOpen, onClose, workspaceId, projectId, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [days, setDays] = useState(6);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [releaseMilestone, setReleaseMilestone] = useState(false);
  const [releaseLabel, setReleaseLabel] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const sprint = await createSprint(workspaceId, {
        projectId,
        name: name.trim(),
        goal: goal.trim() || undefined,
        days: Number(days),
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
        releaseMilestone,
        releaseLabel: releaseMilestone && releaseLabel.trim() ? releaseLabel.trim() : undefined,
        releaseDate: releaseMilestone && releaseDate ? new Date(releaseDate).toISOString() : undefined,
      });

      onSuccess?.(sprint);
      onClose();
      // reset form
      setName('');
      setGoal('');
      setDays(6);
      setStartDate('');
      setEndDate('');
      setReleaseMilestone(false);
      setReleaseLabel('');
      setReleaseDate('');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to create sprint. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all duration-300 scale-100 border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <svg className="h-5 w-5 text-indigo-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Create New Sprint
          </h3>
          <button 
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100 flex items-center gap-2">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Sprint Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sprint 5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Sprint Goal
            </label>
            <textarea
              placeholder="What are we trying to accomplish in this sprint?"
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Working Days
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <span className="text-sm font-medium text-slate-800 block">Release Milestone</span>
                <span className="text-xs text-slate-400">Mark this sprint as carrying a customer release</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={releaseMilestone}
                  onChange={(e) => setReleaseMilestone(e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            {releaseMilestone && (
              <div className="mt-3 grid grid-cols-2 gap-4 animate-fadeIn">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Release Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Release 1"
                    value={releaseLabel}
                    onChange={(e) => setReleaseLabel(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Release Date
                  </label>
                  <input
                    type="date"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="relative rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-violet-700 transition-all flex items-center justify-center min-w-[120px]"
            >
              {loading ? (
                <div className="flex items-center gap-1.5">
                  <Spinner className="h-4 w-4 text-white" />
                  Creating...
                </div>
              ) : (
                'Create Sprint'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
