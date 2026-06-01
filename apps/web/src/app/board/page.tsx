'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/store/auth.store';
import { Board } from '@/components/board/Board';
import { logout } from '@/lib/api/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';

export default function BoardPage() {
  const { isReady, isAuthenticated } = useRequireAuth();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const boardId = useAuthStore((s) => s.defaultBoardId);
  const router = useRouter();

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    clearAuth();
    router.replace('/login');
  };

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader onSignOut={handleLogout} />

      {/* Board */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {boardId ? (
          <Board boardId={boardId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-slate-400">No board yet — import a workbook to get started.</p>
            <Link
              href="/import"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Import workbook →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
