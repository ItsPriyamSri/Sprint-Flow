import { apiFetch } from './client';
import type { SprintDto } from '@sprintflow/shared';

export type { SprintDto };

export async function createSprint(
  workspaceId: string,
  input: {
    projectId?: string;
    name: string;
    goal?: string;
    days?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    releaseMilestone?: boolean;
    releaseLabel?: string;
    releaseDate?: string;
  },
) {
  return apiFetch<SprintDto>('/sprints', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, ...input }),
  });
}

export async function updateSprint(
  sprintId: string,
  workspaceId: string,
  patch: Partial<Omit<SprintDto, 'id' | 'position' | 'projectId'>>,
) {
  return apiFetch<SprintDto>(`/sprints/${sprintId}?workspaceId=${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deleteSprint(sprintId: string, workspaceId: string): Promise<void> {
  return apiFetch(`/sprints/${sprintId}?workspaceId=${workspaceId}`, { method: 'DELETE' });
}

export async function upsertSprintActual(
  sprintId: string,
  workspaceId: string,
  projectMemberId: string,
  actualHours: number,
) {
  return apiFetch<{ projectMemberId: string; actualHours: number }>(
    `/sprints/${sprintId}/actuals/${projectMemberId}?workspaceId=${workspaceId}`,
    { method: 'PUT', body: JSON.stringify({ actualHours }) },
  );
}

export async function deleteSprintActual(
  sprintId: string,
  workspaceId: string,
  projectMemberId: string,
) {
  return apiFetch<void>(
    `/sprints/${sprintId}/actuals/${projectMemberId}?workspaceId=${workspaceId}`,
    { method: 'DELETE' },
  );
}
