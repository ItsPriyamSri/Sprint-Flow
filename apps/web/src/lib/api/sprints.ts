import { apiFetch } from './client';

export interface SprintDto {
  id: string;
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED';
  startDate: string | null;
  endDate: string | null;
  position: number;
}

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
  patch: Partial<Pick<SprintDto, 'name' | 'status' | 'startDate' | 'endDate'>>,
) {
  return apiFetch<SprintDto>(`/sprints/${sprintId}?workspaceId=${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
