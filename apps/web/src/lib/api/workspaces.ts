import { apiFetch } from './client';
import type { ProjectDto } from './projects';

export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  boards: Array<{ id: string; name: string }>;
  sprints: Array<{
    id: string; name: string; status: string; goal: string | null;
    days: number; position: number; projectId: string | null;
  }>;
  epics: Array<{ id: string; name: string; color: string | null; projectId: string | null }>;
  projects: ProjectDto[];
}

export async function getMyWorkspace(): Promise<WorkspaceInfo> {
  return apiFetch('/workspaces/mine');
}
