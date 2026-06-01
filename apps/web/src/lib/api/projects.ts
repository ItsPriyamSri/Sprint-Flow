import { apiFetch } from './client';
import type {
  ProjectDto, ProjectOverviewDto, SprintBoardDto, MyWorkDto,
  ProjectMemberDto, TeamViewDto,
} from '@sprintflow/shared';

export type { ProjectDto, ProjectOverviewDto, SprintBoardDto, MyWorkDto, ProjectMemberDto, TeamViewDto };

export async function listProjects(workspaceId?: string): Promise<{ data: ProjectDto[] }> {
  const qs = workspaceId ? `?workspaceId=${workspaceId}` : '';
  return apiFetch(`/projects${qs}`);
}

export async function getProject(projectId: string): Promise<ProjectOverviewDto> {
  return apiFetch(`/projects/${projectId}`);
}

export async function createProject(input: {
  workspaceId: string;
  name: string;
  description?: string;
  daysPerSprint: number;
  daysPerWeek: number;
  releaseDate?: string;
  members: Array<{ userId: string; role: string; hoursPerDay: number }>;
  sprints: Array<{
    name: string;
    goal?: string;
    startDate?: string;
    endDate?: string;
    releaseMilestone: boolean;
    releaseLabel?: string;
    releaseDate?: string;
  }>;
  epicNames?: string[];
}): Promise<ProjectDto> {
  return apiFetch('/projects', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateProject(
  projectId: string,
  patch: Partial<{ name: string; description: string | null; daysPerSprint: number; daysPerWeek: number; releaseDate: string | null }>,
): Promise<{ id: string; name: string }> {
  return apiFetch(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function updateProjectMember(
  projectId: string,
  memberId: string,
  patch: { role?: string; hoursPerDay?: number },
): Promise<ProjectMemberDto> {
  return apiFetch(`/projects/${projectId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function getSprintBoard(
  sprintId: string,
  workspaceId: string,
): Promise<SprintBoardDto> {
  return apiFetch(`/sprints/${sprintId}/board?workspaceId=${workspaceId}`);
}

export async function getMyWork(projectId: string): Promise<MyWorkDto> {
  return apiFetch(`/projects/${projectId}/my-work`);
}

export async function getTeamView(projectId: string): Promise<TeamViewDto> {
  return apiFetch(`/projects/${projectId}/team`);
}

export async function getBacklog(projectId: string): Promise<{ data: import('@sprintflow/shared').SprintTaskDto[] }> {
  return apiFetch(`/projects/${projectId}/backlog`);
}

export async function updateEpic(
  projectId: string,
  epicId: string,
  patch: { name?: string; color?: string },
): Promise<{ id: string; name: string; color: string | null; projectId: string | null }> {
  return apiFetch(`/projects/${projectId}/epics/${epicId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}
