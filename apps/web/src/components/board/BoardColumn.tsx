'use client';

import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { BoardColumn as ColType } from '@/lib/api/boards';
import { TaskCard } from './TaskCard';
import { CreateTaskForm } from './CreateTaskForm';

interface Props {
  column: ColType;
  boardId: string;
  workspaceId: string;
  canDelete: boolean;
  onTaskClick: (taskId: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

const KEY_COLORS: Record<string, string> = {
  backlog:     'bg-slate-400',
  todo:        'bg-indigo-400',
  in_progress: 'bg-yellow-400',
  review:      'bg-orange-400',
  done:        'bg-green-500',
};

export function BoardColumn({ column, boardId, workspaceId, canDelete, onTaskClick, onDeleteColumn }: Props) {
  // ── Column-level sortable (for drag-reorder of columns) ──────────────────
  const {
    setNodeRef: setColRef,
    transform,
    transition,
    isDragging: isColDragging,
    listeners: colListeners,
    attributes: colAttrs,
  } = useSortable({
    id: `col-${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  // ── Task drop zone inside the column ──────────────────────────────────────
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `col-drop-${column.id}`,
    data: { type: 'column', columnId: column.id },
  });

  const taskIds = column.tasks.map((t) => t.id);
  const accentColor = KEY_COLORS[column.key] ?? 'bg-slate-300';

  const colStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isColDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setColRef}
      style={colStyle}
      className="flex w-[17rem] flex-shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50"
    >
      {/* Column header — drag handle for column reorder */}
      <div
        {...colListeners}
        {...colAttrs}
        className="group/header flex cursor-grab items-center gap-2 rounded-t-xl border-b border-slate-200 bg-white px-3 py-2.5 active:cursor-grabbing"
        title="Drag to reorder column"
      >
        <svg className="h-3.5 w-3.5 flex-shrink-0 text-slate-300" fill="currentColor" viewBox="0 0 16 16" aria-hidden>
          <circle cx="5" cy="4" r="1.3"/><circle cx="11" cy="4" r="1.3"/>
          <circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>
          <circle cx="5" cy="12" r="1.3"/><circle cx="11" cy="12" r="1.3"/>
        </svg>
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${accentColor}`} />
        <span className="flex-1 text-sm font-semibold text-slate-700">{column.name}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {column.tasks.length}
        </span>
        {canDelete && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteColumn(column.id);
            }}
            className="rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover/header:opacity-100"
            title={`Delete ${column.name}`}
            aria-label={`Delete column ${column.name}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Task list — sortable within column */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setDropRef}
          className={`flex min-h-[8rem] flex-1 flex-col gap-2 p-2 transition-colors ${
            isOver ? 'bg-indigo-50' : ''
          }`}
        >
          {column.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              columnId={column.id}
              onEdit={() => onTaskClick(task.id)}
            />
          ))}
        </div>
      </SortableContext>

      {/* Add task */}
      <div className="px-2 pb-2">
        <CreateTaskForm columnId={column.id} boardId={boardId} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
