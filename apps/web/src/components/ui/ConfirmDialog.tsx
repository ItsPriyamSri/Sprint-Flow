'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmStore } from '@/store/confirm.store';

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const answer = useConfirmStore((s) => s.answer);
  const [typedValue, setTypedValue] = useState('');

  useEffect(() => {
    if (!request) {
      setTypedValue('');
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, answer]);

  if (!request) return null;

  const isDanger = request.variant === 'danger';
  const confirmLabel = request.confirmLabel ?? (isDanger ? 'Delete' : 'Confirm');
  const cancelLabel = request.cancelLabel ?? 'Cancel';
  const typedToken = request.requireTypedConfirm;
  const typedOk = !typedToken || typedValue === typedToken;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="presentation"
      onClick={() => answer(false)}
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className={`relative w-full rounded-xl border bg-white p-6 shadow-2xl ${
          typedToken ? 'max-w-lg border-rose-200' : 'max-w-md border-slate-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          <div
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
              isDanger ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
            }`}
            aria-hidden
          >
            {isDanger ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
              {request.title}
            </h2>
            <p id="confirm-dialog-message" className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
              {request.message}
            </p>
          </div>
        </div>

        {typedToken && (
          <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50/60 p-4">
            <label htmlFor="confirm-typed-input" className="block text-xs font-semibold uppercase tracking-wider text-rose-800">
              Type <span className="font-mono normal-case">{typedToken}</span> to confirm
            </label>
            <input
              id="confirm-typed-input"
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              autoComplete="off"
              autoFocus
              placeholder={typedToken}
              className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => answer(false)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!typedOk}
            onClick={() => answer(true)}
            className={
              isDanger
                ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40'
                : 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
