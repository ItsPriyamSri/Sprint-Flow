'use client';

import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardTask } from '@/lib/api/boards';

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-200 text-slate-600',
};

interface Props {
  task: BoardTask;
  columnId: string;
  onEdit: () => void;
}

export function TaskCard({ task, columnId, onEdit }: Props) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const { setNodeRef, transform, transition, isDragging, listeners, attributes } = useSortable({
    id: task.id,
    data: { type: 'task', task, columnId },
  });

  const dragListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      pointerStart.current = { x: e.clientX, y: e.clientY };
      listeners?.onPointerDown?.(e);
    },
    onPointerUp: (e: React.PointerEvent) => {
      const start = pointerStart.current;
      pointerStart.current = null;
      if (start) {
        const dx = Math.abs(e.clientX - start.x);
        const dy = Math.abs(e.clientY - start.y);
        if (dx < 6 && dy < 6) onEdit();
      }
      listeners?.onPointerUp?.(e);
    },
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragListeners}
      {...attributes}
      className={`group relative cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-indigo-300 hover:shadow-md active:cursor-grabbing ${
        task.blocked ? 'border-l-4 border-l-red-500 bg-red-50/5' : ''
      }`}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="absolute right-2 top-2 z-10 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 opacity-0 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 group-hover:opacity-100"
        aria-label="Edit task"
      >
        Edit
      </button>

      <p className="pr-12 text-sm font-medium leading-snug text-slate-800 line-clamp-3">{task.title}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {task.blocked && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 animate-pulse" title={task.blockedReason || 'Blocked'}>
            🚫 Blocked
          </span>
        )}
        {task.externalId && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            #{task.externalId}
          </span>
        )}
        {task.priority && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
            {task.priority}
          </span>
        )}
        {task.epicName && (
          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
            {task.epicName}
          </span>
        )}
        {task.sprintName && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">
            {task.sprintName}
          </span>
        )}
      </div>

      {task.assignments && task.assignments.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {task.assignments.slice(0, 3).map((a) => (
            <div key={a.id} className="flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
              {a.memberName.slice(0, 2).toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
