import { apiFetch } from './client';

export interface TaskAssignment {
  id: string;
  projectMemberId: string;
  memberName: string;
  hours: number;
}

export interface TaskDetail {
  id: string;
  externalId: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  priority: string | null;
  columnId: string;
  projectId: string | null;
  sprintId: string | null;
  epicId: string | null;
  done: boolean;
  deferred: boolean;
  deferredReason: string | null;
  assignments: TaskAssignment[];
  position: number;
  createdAt: string;
  updatedAt: string;
  sprint: { id: string; name: string } | null;
  epic: { id: string; name: string; color: string | null } | null;
  column: { id: string; name: string; key: string };
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string };
  }>;
}

export interface CreateTaskInput {
  workspaceId: string;
  boardId: string;
  columnId: string;
  projectId?: string;
  title: string;
  priority?: string;
  sprintId?: string;
  epicId?: string;
  done?: boolean;
  deferred?: boolean;
  deferredReason?: string;
}

export async function createTask(input: CreateTaskInput) {
  return apiFetch<TaskDetail>('/tasks', { method: 'POST', body: JSON.stringify(input) });
}

export async function getTask(taskId: string, workspaceId: string) {
  return apiFetch<TaskDetail>(`/tasks/${taskId}?workspaceId=${workspaceId}`);
}

export async function updateTask(
  taskId: string,
  workspaceId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    notes: string | null;
    priority: string | null;
    sprintId: string | null;
    epicId: string | null;
    columnId: string;
    externalId: string | null;
    done: boolean;
    deferred: boolean;
    deferredReason: string | null;
    projectId: string | null;
  }>,
) {
  return apiFetch<TaskDetail>(`/tasks/${taskId}?workspaceId=${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function moveTask(
  taskId: string,
  workspaceId: string,
  move: { columnId: string; position: number },
) {
  return apiFetch<TaskDetail>(`/tasks/${taskId}/move?workspaceId=${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(move),
  });
}

export async function upsertAssignment(
  taskId: string,
  workspaceId: string,
  projectMemberId: string,
  hours: number,
) {
  return apiFetch(`/tasks/${taskId}/assignments/${projectMemberId}?workspaceId=${workspaceId}`, {
    method: 'PUT',
    body: JSON.stringify({ hours }),
  });
}

export async function removeAssignment(
  taskId: string,
  workspaceId: string,
  projectMemberId: string,
) {
  return apiFetch(`/tasks/${taskId}/assignments/${projectMemberId}?workspaceId=${workspaceId}`, {
    method: 'DELETE',
  });
}

export async function deleteTask(taskId: string, workspaceId: string) {
  return apiFetch<void>(`/tasks/${taskId}?workspaceId=${workspaceId}`, { method: 'DELETE' });
}

export async function createComment(taskId: string, workspaceId: string, body: string) {
  return apiFetch(`/tasks/${taskId}/comments?workspaceId=${workspaceId}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
