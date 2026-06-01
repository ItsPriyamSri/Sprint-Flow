import { apiFetch } from './client';
import type { SprintDto } from '@sprintflow/shared';

export type { SprintDto };

export async function listSprints(workspaceId: string) {
  return apiFetch<{ data: SprintDto[] }>(`/sprints?workspaceId=${workspaceId}`);
}

export async function createSprint(workspaceId: string, name: string) {
  return apiFetch<SprintDto>('/sprints', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, name }),
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
