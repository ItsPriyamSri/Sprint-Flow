'use client';

import { useState } from 'react';
import type { UploadResponse } from '@/lib/api/import';

const ALL_FIELDS = [
  { value: 'title',      label: 'Title / Task name' },
  { value: 'externalId', label: 'ID (task number)' },
  { value: 'sprintName', label: 'Sprint' },
  { value: 'epicName',   label: 'Epic' },
  { value: 'ownerName',  label: 'Owner / Assignee' },
  { value: 'priority',   label: 'Priority' },
  { value: 'status',     label: 'Status' },
  { value: 'notes',      label: 'Notes' },
  { value: 'hoursN',     label: 'Hours (Normalised)' },
  { value: 'hoursI',     label: 'Hours (Incurred)' },
  { value: 'hoursTotal', label: 'Hours (Total)' },
  { value: '_ignore',    label: '— Ignore this column —' },
];

interface Props {
  upload: UploadResponse;
  onConfirm: (columnMap: Record<string, string>) => void;
  onBack: () => void;
  loading: boolean;
  error?: string | null;
}

export function Step2Mapping({ upload, onConfirm, onBack, loading, error }: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>({ ...upload.columnMap });

  const setField = (header: string, field: string) =>
    setMapping((m) => ({ ...m, [header]: field }));

  const headers = Object.keys(upload.columnMap);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Review column mapping</h2>
        <p className="mt-1 text-sm text-slate-500">
          We detected <strong className="text-slate-700">"{upload.detectedSheet}"</strong> as the task sheet.
          Confirm or adjust how each column maps to SprintFlow fields.
        </p>
      </div>

      {/* Detection summary */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <span className="font-medium">Header row:</span> row {upload.headerRowIndex + 1} &nbsp;·&nbsp;
        <span className="font-medium">Detected columns:</span> {headers.length}
      </div>

      {/* Column mapping table */}
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Excel column</th>
              <th className="px-4 py-3">Maps to</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {headers.map((header) => (
              <tr key={header} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-700">{header}</td>
                <td className="px-4 py-3">
                  <select
                    value={mapping[header] ?? '_ignore'}
                    onChange={(e) => setField(header, e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {ALL_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
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
          ← Back
        </button>
        <button
          onClick={() => {
            // Filter out ignored columns
            const filtered = Object.fromEntries(
              Object.entries(mapping).filter(([, v]) => v !== '_ignore'),
            );
            onConfirm(filtered);
          }}
          disabled={loading}
          className="flex-[2] rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Validating…' : 'Preview data →'}
        </button>
      </div>
    </div>
  );
}
