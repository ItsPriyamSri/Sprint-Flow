import { apiFetch } from './client';
import type { UserDto } from '@sprintflow/shared';

export interface LoginResponse {
  accessToken: string;
  user: UserDto & {
    memberships: Array<{
      workspaceId: string;
      workspaceName: string;
      workspaceSlug: string;
      role: string;
      boards: Array<{ id: string; name: string }>;
    }>;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<LoginResponse['user']> {
  return apiFetch('/auth/me');
}
