'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

interface Props {
  subtitle?: string;
  onSignOut: () => void;
}

export function AppHeader({ subtitle = 'Main Board', onSignOut }: Props) {
  const user = useAuthStore((s) => s.user);
  const displayName = user?.name ?? 'User';

  return (
    <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="text-base font-bold tracking-tight text-indigo-600">SprintFlow</span>
        <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden />
        <span className="hidden text-sm font-medium text-slate-500 sm:block">{subtitle}</span>
      </div>

      <nav className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/import"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
        >
          Import workbook
        </Link>

        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 shadow-sm">
          <div className="flex items-center gap-2 px-2.5 py-1">
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white"
              aria-hidden
            >
              {initials(displayName)}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-medium leading-tight text-slate-800">{displayName}</p>
              {user?.email && (
                <p className="truncate text-[11px] leading-tight text-slate-400">{user.email}</p>
              )}
            </div>
          </div>
          <span className="h-6 w-px bg-slate-200" aria-hidden />
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
}
