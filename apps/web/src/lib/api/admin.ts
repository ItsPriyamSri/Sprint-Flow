import { apiFetch } from './client';

export interface AdminUser {
  id: string;
  email: string | null;
  name: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
  projectMemberships: Array<{ id: string; projectId: string; role: string }>;
}

export async function listAdminUsers(workspaceId?: string): Promise<{ data: AdminUser[] }> {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiFetch(`/admin/users${qs}`);
}

export async function setUserLead(
  userId: string,
  projectId: string,
  role: 'LEAD' | 'MEMBER' | 'VIEWER',
): Promise<{ id: string; userId: string; projectId: string; role: string }> {
  return apiFetch(`/admin/users/${userId}/lead`, {
    method: 'PATCH',
    body: JSON.stringify({ projectId, role }),
  });
}

export async function setUserStatus(
  userId: string,
  status: 'ACTIVE' | 'DEACTIVATED',
): Promise<{ id: string; status: string }> {
  return apiFetch(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function resetUserPassword(userId: string): Promise<{ message: string }> {
  return apiFetch(`/admin/users/${userId}/reset-password`, { method: 'POST' });
}
