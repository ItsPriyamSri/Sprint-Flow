'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ImportWizard } from '@/components/import/ImportWizard';
import { useAuthStore } from '@/store/auth.store';
import Link from 'next/link';

export default function ImportPage() {
  const { isReady, isAuthenticated } = useRequireAuth();
  const user = useAuthStore((s) => s.user);

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/board" className="text-lg font-bold text-indigo-600">SprintFlow</Link>
          <span className="text-sm text-slate-400">{user?.name}</span>
        </div>
      </header>

      <main className="px-6 py-12">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h1 className="text-3xl font-bold text-slate-800">Import Workbook</h1>
          <p className="mt-2 text-slate-500">
            Upload your Excel workbook — we'll detect the task list and build your board automatically.
          </p>
        </div>
        <ImportWizard />
      </main>
    </div>
  );
}
