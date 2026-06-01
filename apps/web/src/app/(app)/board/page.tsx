'use client';

import { useAuthStore } from '@/store/auth.store';
import { Board } from '@/components/board/Board';

export default function FlowViewPage() {
  const boardId = useAuthStore((s) => s.defaultBoardId);

  if (!boardId) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        No board found. Set up a workspace board first.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900">Flow view</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
            Kanban
          </span>
        </div>
        <p className="text-xs text-slate-400">Status-based board — task status syncs with sprint progress.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Board boardId={boardId} />
      </div>
    </div>
  );
}
