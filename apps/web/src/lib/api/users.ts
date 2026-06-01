import { apiFetch } from './client';

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export async function listWorkspaceUsers(workspaceId: string, q?: string) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const qs = params.toString();
  return apiFetch<{ data: WorkspaceUser[] }>(
    `/users/workspace/${workspaceId}${qs ? `?${qs}` : ''}`,
  );
}
