'use client';

import { useBoardStore, type BoardView } from '@/store/board.store';

const VIEWS: { key: BoardView; label: string; icon: string }[] = [
  { key: 'board', label: 'Board', icon: '⬜' },
  { key: 'owner', label: 'Owner', icon: '👤' },
];

export function ViewSwitcher() {
  const activeView = useBoardStore((s) => s.activeView);
  const setView    = useBoardStore((s) => s.setView);

  return (
    <div className="flex items-center gap-1" role="tablist" aria-label="Board view">
      {VIEWS.map(({ key, label, icon }) => (
        <button
          key={key}
          role="tab"
          aria-selected={activeView === key}
          onClick={() => setView(key)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeView === key
              ? 'bg-indigo-600 text-white'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
          }`}
        >
          <span aria-hidden>{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}
