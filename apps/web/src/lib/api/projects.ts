import { apiFetch } from './client';
import type {
  ProjectDto, ProjectOverviewDto, SprintBoardDto, MyWorkDto,
  ProjectMemberDto,
} from '@sprintflow/shared';

export type { ProjectDto, ProjectOverviewDto, SprintBoardDto, MyWorkDto, ProjectMemberDto };

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

export async function getTeamView(projectId: string) {
  return apiFetch<{
    project: { id: string; name: string };
    team: Array<{
      member: ProjectMemberDto;
      totalCommittedHours: number;
      totalCapacityHours: number;
      weeklyCapacity: number;
      perSprint: Array<{
        sprintId: string; sprintName: string;
        committedHours: number; budgetHours: number; overloaded: boolean;
      }>;
      overloaded: boolean;
    }>;
  }>(`/projects/${projectId}/team`);
}
