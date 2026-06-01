'use client';

import { ImportWizard } from '@/components/import/ImportWizard';

export default function ImportPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-slate-900">Import Excel</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Import your CARR spreadsheet. Tasks will be mapped to the active project's sprints and epics.
        </p>
      </div>
      <div className="flex-1 px-6 py-6">
        <ImportWizard />
      </div>
    </div>
  );
}
