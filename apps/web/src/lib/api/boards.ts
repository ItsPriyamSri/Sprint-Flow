import { apiFetch } from './client';
import type { QueryClient } from '@tanstack/react-query';
import type { TaskDetail } from './tasks';

export interface TaskAssignment {
  id: string;
  projectMemberId: string;
  memberName: string;
  hours: number;
}

export interface BoardTask {
  id: string;
  externalId: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  priority: string | null;
  columnId: string;
  projectId: string | null;
  sprintId: string | null;
  sprintName: string | null;
  epicId: string | null;
  epicName: string | null;
  epicColor: string | null;
  done: boolean;
  deferred: boolean;
  deferredReason: string | null;
  assignments: TaskAssignment[];
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardColumn {
  id: string;
  name: string;
  key: string;
  position: number;
  wipLimit: number | null;
  tasks: BoardTask[];
}

export interface BoardDto {
  id: string;
  name: string;
  workspaceId: string;
  columns: BoardColumn[];
}

export async function fetchBoard(boardId: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters);
  const qs = params.toString();
  return apiFetch<BoardDto>(`/boards/${boardId}${qs ? `?${qs}` : ''}`);
}

/** Stable query key — always includes the filter object (may be empty). */
export function boardQueryKey(boardId: string, filters: Record<string, string> = {}) {
  return ['board', boardId, filters] as const;
}

/** Update every cached board variant for this board (all active filter combos). */
export function updateBoardCache(
  queryClient: QueryClient,
  boardId: string,
  updater: (board: BoardDto) => BoardDto,
) {
  queryClient.setQueriesData<BoardDto>(
    { queryKey: ['board', boardId] },
    (old) => (old ? updater(old) : old),
  );
}

export async function addColumn(boardId: string, name: string) {
  return apiFetch<{ id: string; name: string; key: string; position: number }>(`/boards/${boardId}/columns`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function reorderColumns(boardId: string, columnIds: string[]) {
  return apiFetch<void>(`/boards/${boardId}/columns/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ columnIds }),
  });
}

export async function deleteColumn(boardId: string, columnId: string) {
  return apiFetch<void>(`/boards/${boardId}/columns/${columnId}`, { method: 'DELETE' });
}

// ─── Position helpers ─────────────────────────────────────────────────────────

export function resolveDropColumnId(board: BoardDto, overId: string): string | null {
  if (overId.startsWith('col-drop-')) return overId.slice('col-drop-'.length);
  if (overId.startsWith('col-')) {
    const colId = overId.slice('col-'.length);
    return board.columns.some((c) => c.id === colId) ? colId : null;
  }
  for (const col of board.columns) {
    if (col.tasks.some((t) => t.id === overId)) return col.id;
  }
  return null;
}

export function computeDropPosition(
  board: BoardDto,
  activeId: string,
  overId: string,
): { columnId: string; position: number } | null {
  const dropColId = resolveDropColumnId(board, overId);
  if (dropColId && (overId.startsWith('col-drop-') || overId.startsWith('col-'))) {
    const col = board.columns.find((c) => c.id === dropColId);
    if (!col) return null;
    const others = col.tasks.filter((t) => t.id !== activeId);
    const lastPos = others[others.length - 1]?.position ?? 0;
    return { columnId: dropColId, position: lastPos + 1000 };
  }

  for (const col of board.columns) {
    const overIdx = col.tasks.findIndex((t) => t.id === overId);
    if (overIdx === -1) continue;
    const others = col.tasks.filter((t) => t.id !== activeId);
    const overIdxInOthers = others.findIndex((t) => t.id === overId);
    const prev = others[overIdxInOthers - 1];
    const next = others[overIdxInOthers];

    let position: number;
    if (!prev && !next) position = 1000;
    else if (!prev) position = next!.position / 2;
    else if (!next) position = prev.position + 1000;
    else position = (prev.position + next.position) / 2;

    return { columnId: col.id, position };
  }

  return null;
}

export function getTaskPlacementFromBoard(
  board: BoardDto,
  taskId: string,
): { columnId: string; position: number } | null {
  for (const col of board.columns) {
    const task = col.tasks.find((t) => t.id === taskId);
    if (task) return { columnId: col.id, position: task.position };
  }
  return null;
}

export function moveTaskInBoard(board: BoardDto, taskId: string, targetColumnId: string, position: number): BoardDto {
  let moved: BoardTask | null = null;

  const stripped = board.columns.map((col) => ({
    ...col,
    tasks: col.tasks.filter((t) => { if (t.id === taskId) { moved = t; return false; } return true; }),
  }));

  if (!moved) return board;
  const task = { ...(moved as BoardTask), columnId: targetColumnId, position };

  return {
    ...board,
    columns: stripped.map((col) => {
      if (col.id !== targetColumnId) return col;
      const tasks = [...col.tasks, task].sort((a, b) => a.position - b.position);
      return { ...col, tasks };
    }),
  };
}

export function columnLabelForTask(board: BoardDto, task: BoardTask): string {
  return board.columns.find((c) => c.id === task.columnId)?.name ?? 'Unknown';
}

export function boardTaskFromDetail(task: TaskDetail): BoardTask {
  return {
    id: task.id,
    externalId: task.externalId,
    title: task.title,
    description: task.description,
    notes: task.notes,
    priority: task.priority,
    columnId: task.columnId,
    projectId: task.projectId,
    sprintId: task.sprintId,
    sprintName: task.sprint?.name ?? null,
    epicId: task.epicId,
    epicName: task.epic?.name ?? null,
    epicColor: task.epic?.color ?? null,
    done: task.done,
    deferred: task.deferred,
    deferredReason: task.deferredReason,
    assignments: task.assignments,
    position: task.position,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function syncTaskInBoardCache(
  queryClient: QueryClient,
  boardId: string,
  task: TaskDetail,
) {
  const boardTask = boardTaskFromDetail(task);
  updateBoardCache(queryClient, boardId, (old) => {
    const without = old.columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((t) => t.id !== task.id),
    }));
    return {
      ...old,
      columns: without.map((col) => {
        if (col.id !== task.columnId) return col;
        const tasks = [...col.tasks, boardTask].sort((a, b) => a.position - b.position);
        return { ...col, tasks };
      }),
    };
  });
}
