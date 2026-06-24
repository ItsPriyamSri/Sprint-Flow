import { apiFetch } from './client';
import type { UserDto } from '@sprintflow/shared';

export interface ProjectMembership {
  id: string;
  projectId: string;
  role: 'LEAD' | 'MEMBER' | 'VIEWER';
  hoursPerDay: number;
}

export interface LoginResponse {
  accessToken: string;
  user: UserDto & {
    mustChangePassword?: boolean;
    memberships: Array<{
      workspaceId: string;
      workspaceName: string;
      workspaceSlug: string;
      role: string;
      boards: Array<{ id: string; name: string }>;
    }>;
    projectMemberships: ProjectMembership[];
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<LoginResponse['user']> {
  return apiFetch('/auth/me');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/auth/me/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
