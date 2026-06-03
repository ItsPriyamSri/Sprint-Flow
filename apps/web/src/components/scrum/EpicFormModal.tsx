'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createEpic, updateEpic, deleteEpic } from '@/lib/api/projects';
import { Button, Spinner } from '@sprintflow/ui';
import type { EpicDto } from '@sprintflow/shared';
import { invalidateProjectScopedQueries } from '@/lib/queryInvalidation';

const PRESET_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
  '#06b6d4',
] as const;

const DEFAULT_COLOR = '#6366f1';

function isValidHex(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

export function invalidateEpicQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  invalidateProjectScopedQueries(queryClient, projectId);
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  epic?: EpicDto | null;
  onSuccess?: () => void;
}

export function EpicFormModal({ isOpen, onClose, projectId, epic = null, onSuccess }: Props) {
  const isEdit = !!epic;
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [hexInput, setHexInput] = useState(DEFAULT_COLOR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const initialColor = epic?.color && isValidHex(epic.color) ? epic.color : DEFAULT_COLOR;
    setName(epic?.name ?? '');
    setColor(initialColor);
    setHexInput(initialColor);
    setError(null);
    setConfirmDelete(false);
  }, [isOpen, epic]);

  if (!isOpen) return null;

  const handleHexBlur = () => {
    const normalized = hexInput.startsWith('#') ? hexInput : `#${hexInput}`;
    if (isValidHex(normalized)) {
      setColor(normalized);
      setHexInput(normalized);
    } else {
      setHexInput(color);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      if (isEdit && epic) {
        await updateEpic(projectId, epic.id, {
          name: trimmed,
          color,
        });
      } else {
        await createEpic(projectId, { name: trimmed, color });
      }
      invalidateEpicQueries(queryClient, projectId);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save epic. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!epic) return;
    setLoading(true);
    setError(null);
    try {
      await deleteEpic(projectId, epic.id);
      invalidateEpicQueries(queryClient, projectId);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete epic. Please try again.';
      setError(message);
      setConfirmDelete(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all duration-300 border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md text-xs" style={{ backgroundColor: color }}>
              🚀
            </span>
            {isEdit ? 'Edit Epic' : 'New Epic'}
          </h3>
          <button
            type="button"
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
              Epic Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Authentication"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Color
            </label>
            <div className="grid grid-cols-8 gap-2 mb-3">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setColor(c);
                    setHexInput(c);
                  }}
                  className={`h-7 w-7 rounded-md border border-black/5 transition-transform hover:scale-110 ${
                    color === c ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-8 w-8 flex-shrink-0 rounded-lg border border-slate-200 shadow-inner"
                style={{ backgroundColor: color }}
              />
              <input
                type="text"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onBlur={handleHexBlur}
                placeholder="#6366f1"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono text-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {isEdit && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={loading}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
                >
                  Delete epic…
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-700">Delete epic? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={loading}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loading}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {loading ? 'Deleting…' : 'Confirm delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 mt-2">
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
              className="relative rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-violet-700 transition-all flex items-center justify-center min-w-[100px]"
            >
              {loading ? (
                <div className="flex items-center gap-1.5">
                  <Spinner className="h-4 w-4 text-white" />
                  Saving…
                </div>
              ) : isEdit ? (
                'Save Epic'
              ) : (
                'Create Epic'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
