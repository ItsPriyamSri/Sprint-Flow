import type { BoardTask } from '@/lib/api/boards';

export function DragOverlayCard({ task }: { task: BoardTask }) {
  return (
    <div className="w-64 rotate-2 rounded-lg border border-indigo-300 bg-white p-3 shadow-xl ring-2 ring-indigo-200">
      <p className="text-sm font-medium text-slate-800 line-clamp-2">{task.title}</p>
      {task.externalId && (
        <span className="mt-1 block font-mono text-[10px] text-slate-400">#{task.externalId}</span>
      )}
    </div>
  );
}
