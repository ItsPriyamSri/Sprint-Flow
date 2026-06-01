'use client';

import Link from 'next/link';
import type { CommitResponse } from '@/lib/api/import';

interface Props {
  result: CommitResponse;
  filename: string;
  onImportAnother: () => void;
}

export function Step4Commit({ result, filename, onImportAnother }: Props) {
  return (
    <div className="space-y-8 py-4 text-center">
      <div>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Import complete!</h2>
        <p className="mt-2 text-slate-500">
          <span className="font-medium text-slate-700">{filename}</span> has been imported successfully.
        </p>
      </div>

      {/* Stats */}
      <div className="mx-auto grid max-w-sm grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white py-4">
          <p className="text-3xl font-bold text-indigo-600">{result.committed}</p>
          <p className="mt-1 text-xs text-slate-500">Tasks created</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white py-4">
          <p className="text-3xl font-bold text-slate-500">{result.skipped}</p>
          <p className="mt-1 text-xs text-slate-500">Skipped</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white py-4">
          <p className="text-3xl font-bold text-red-400">{result.errors}</p>
          <p className="mt-1 text-xs text-slate-500">Errors</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href={`/board${result.boardId ? `?boardId=${result.boardId}` : ''}`}
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Open board →
        </Link>
        <button
          onClick={onImportAnother}
          className="text-sm text-slate-500 hover:text-slate-700 hover:underline"
        >
          Import another workbook
        </button>
      </div>
    </div>
  );
}
