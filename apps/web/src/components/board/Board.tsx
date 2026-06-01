'use client';

import { useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBoard,
  addColumn,
  reorderColumns,
  deleteColumn,
  computeDropPosition,
  resolveDropColumnId,
  getTaskPlacementFromBoard,
  moveTaskInBoard,
  boardQueryKey,
  updateBoardCache,
  type BoardDto,
  type BoardTask,
  type BoardColumn as BoardColumnType,
} from '@/lib/api/boards';
import { moveTask } from '@/lib/api/tasks';
import { useBoardStore } from '@/store/board.store';
import { confirm } from '@/store/confirm.store';
import { useAuthStore } from '@/store/auth.store';
import { BoardColumn } from './BoardColumn';
import { DragOverlayCard } from './DragOverlayCard';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { FilterBar } from './FilterBar';

interface Props {
  boardId: string;
}

export function Board({ boardId }: Props) {
  const authWorkspaceId = useAuthStore((s) => s.defaultWorkspaceId);
  const { openTask, filters } = useBoardStore();
  const queryClient = useQueryClient();
  const [activeDragTask,   setActiveDragTask]   = useState<BoardTask | null>(null);
  const [activeDragColumn, setActiveDragColumn] = useState<BoardColumnType | null>(null);
  const [newColName, setNewColName] = useState('');
  const [addingCol, setAddingCol]   = useState(false);
  const dragOriginRef = useRef<{ columnId: string; position: number } | null>(null);

  // Strip undefined values so the query key is stable and params are clean
  const filterParams = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][],
  );

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: board, isLoading, isError } = useQuery({
    queryKey: boardQueryKey(boardId, filterParams),
    queryFn: () => fetchBoard(boardId, filterParams),
    enabled: !!boardId,
    staleTime: 10_000,
  });

  // Prefer board payload over auth store — survives stale sessions missing workspaceId
  const workspaceId = board?.workspaceId ?? authWorkspaceId ?? '';

  // ── Mutations ─────────────────────────────────────────────────────────────
  const moveMutation = useMutation({
    mutationFn: ({
      taskId,
      columnId,
      position,
      wsId,
    }: {
      taskId: string;
      columnId: string;
      position: number;
      wsId: string;
    }) => moveTask(taskId, wsId, { columnId, position }),
    onSuccess: (_data, { taskId, columnId, position }) => {
      updateBoardCache(queryClient, boardId, (old) =>
        moveTaskInBoard(old, taskId, columnId, position),
      );
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const deleteColumnMutation = useMutation({
    mutationFn: (columnId: string) => deleteColumn(boardId, columnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId] });
    },
  });

  const addColumnMutation = useMutation({
    mutationFn: (name: string) => addColumn(boardId, name),
    onSuccess: (newCol) => {
      updateBoardCache(queryClient, boardId, (old) => ({
        ...old,
        columns: [
          ...old.columns,
          { ...newCol, wipLimit: null, tasks: [] },
        ],
      }));
      setNewColName('');
      setAddingCol(false);
    },
  });

  const reorderColumnsMutation = useMutation({
    mutationFn: (columnIds: string[]) => reorderColumns(boardId, columnIds),
    onError: () => queryClient.invalidateQueries({ queryKey: ['board', boardId] }),
  });

  // ── DnD sensors ──────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { type: string; task?: BoardTask; columnId?: string } | undefined;
    if (data?.type === 'task' && data.task && board) {
      setActiveDragTask(data.task);
      dragOriginRef.current = getTaskPlacementFromBoard(board, data.task.id);
    }
    if (data?.type === 'column' && data.columnId && board) {
      const col = board.columns.find((c) => c.id === data.columnId) ?? null;
      setActiveDragColumn(col);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const activeType = (active.data.current as { type?: string } | undefined)?.type;
    if (activeType === 'column' || !over || !board || !activeDragTask) return;

    const activeId = String(active.id);
    const overId   = String(over.id);
    if (activeId === overId) return;

    const current = queryClient.getQueryData<BoardDto>(boardQueryKey(boardId, filterParams)) ?? board;

    const targetColId = resolveDropColumnId(current, overId);
    if (!targetColId) return;

    const sourceColId = current.columns.find((c) => c.tasks.some((t) => t.id === activeId))?.id;
    if (sourceColId === targetColId) return;

    updateBoardCache(queryClient, boardId, (old) => {
      const lastPos = old.columns.find((c) => c.id === targetColId)?.tasks.slice(-1)[0]?.position ?? 0;
      return moveTaskInBoard(old, activeId, targetColId, lastPos + 500);
    });
  };

  const commitTaskMove = (
    activeId: string,
    drop: { columnId: string; position: number },
    wsId: string,
  ) => {
    updateBoardCache(queryClient, boardId, (old) =>
      moveTaskInBoard(old, activeId, drop.columnId, drop.position),
    );
    moveMutation.mutate({
      taskId: activeId,
      columnId: drop.columnId,
      position: drop.position,
      wsId,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeType = (active.data.current as { type?: string } | undefined)?.type;

    setActiveDragTask(null);
    setActiveDragColumn(null);

    if (!board) return;

    const activeId = String(active.id);
    const current = queryClient.getQueryData<BoardDto>(boardQueryKey(boardId, filterParams)) ?? board;

    // ── Column reorder (requires a drop target) ─────────────────────────────
    if (activeType === 'column') {
      if (!over) return;
      const overId = String(over.id);
      if (activeId === overId) return;

      const oldIdx = board.columns.findIndex((c) => `col-${c.id}` === activeId);
      const newIdx = board.columns.findIndex((c) => `col-${c.id}` === overId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

      const reordered = arrayMove(board.columns, oldIdx, newIdx);
      updateBoardCache(queryClient, boardId, (old) => ({ ...old, columns: reordered }));
      reorderColumnsMutation.mutate(reordered.map((c) => c.id));
      return;
    }

    // ── Task move ─────────────────────────────────────────────────────────
    const wsId = current.workspaceId ?? authWorkspaceId ?? '';
    if (!wsId) return;

    const origin = dragOriginRef.current ?? getTaskPlacementFromBoard(board, activeId);
    dragOriginRef.current = null;

    let drop: { columnId: string; position: number } | null = null;

    if (over) {
      const overId = String(over.id);
      if (activeId !== overId) {
        drop = computeDropPosition(current, activeId, overId);
      }
    }

    // dnd-kit often clears `over` on dragEnd; use cache from handleDragOver
    if (!drop) {
      drop = getTaskPlacementFromBoard(current, activeId);
    }

    if (!drop) return;

    // No-op if dropped back in the same place
    if (origin && origin.columnId === drop.columnId && origin.position === drop.position) {
      return;
    }

    commitTaskMove(activeId, drop, wsId);
  };

  // ── Shared top bar ────────────────────────────────────────────────────────
  const topBar = (
    <div className="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-2.5">
      <FilterBar workspaceId={workspaceId} />
    </div>
  );

  // ── Loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {topBar}
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 py-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-64 w-[17rem] flex-shrink-0 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !board) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {topBar}
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Failed to load board — check that the API is running and you are logged in.
        </div>
      </div>
    );
  }

  // ── Kanban flow view ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col">
      {topBar}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* Horizontal SortableContext enables column drag-reorder */}
        <SortableContext
          items={board.columns.map((c) => `col-${c.id}`)}
          strategy={horizontalListSortingStrategy}
        >
        <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto px-6 py-6 pb-10">
          {board.columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              boardId={boardId}
              workspaceId={workspaceId}
              canDelete={board.columns.length > 1}
              onTaskClick={openTask}
              onDeleteColumn={async (columnId) => {
                const target = board.columns.find((c) => c.id === columnId);
                if (!target) return;

                const message =
                  target.tasks.length > 0
                    ? `"${target.name}" will be deleted and ${target.tasks.length} task(s) will move to Backlog.`
                    : `"${target.name}" will be removed from the board.`;

                const ok = await confirm({
                  title: `Delete column "${target.name}"?`,
                  message,
                  confirmLabel: 'Delete column',
                  variant: 'danger',
                });
                if (ok) deleteColumnMutation.mutate(columnId);
              }}
            />
          ))}

          {/* Add column */}
          <div className="flex-shrink-0 w-[17rem]">
            {addingCol ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
                <input
                  autoFocus
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newColName.trim()) addColumnMutation.mutate(newColName.trim());
                    if (e.key === 'Escape') { setAddingCol(false); setNewColName(''); }
                  }}
                  placeholder="Column name…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => { if (newColName.trim()) addColumnMutation.mutate(newColName.trim()); }}
                    disabled={!newColName.trim() || addColumnMutation.isPending}
                    className="rounded-md bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAddingCol(false); setNewColName(''); }}
                    className="rounded-md px-3 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingCol(true)}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/50 px-4 py-3 text-sm text-slate-400 hover:border-indigo-300 hover:bg-white hover:text-indigo-500"
              >
                <span className="text-lg">+</span> Add column
              </button>
            )}
          </div>
        </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeDragTask   && <DragOverlayCard task={activeDragTask} />}
          {activeDragColumn && (
            <div className="w-[17rem] rotate-2 rounded-xl border border-indigo-300 bg-white/80 p-3 shadow-xl ring-2 ring-indigo-200 opacity-90">
              <p className="text-sm font-semibold text-slate-700">{activeDragColumn.name}</p>
              <p className="text-xs text-slate-400">{activeDragColumn.tasks.length} tasks</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <TaskDetailDrawer boardId={boardId} workspaceId={workspaceId} />
    </div>
  );
}
