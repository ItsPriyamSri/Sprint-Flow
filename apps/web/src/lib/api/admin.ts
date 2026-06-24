import { apiFetch } from './client';

export interface LinkedName {
  id: string;
  name: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  name: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
  projectMemberships: Array<{ id: string; projectId: string; role: string }>;
  linkedNames: LinkedName[];
}

export interface AdminUsersResponse {
  data: AdminUser[];
  unlinkedNames: LinkedName[];
}

export async function listAdminUsers(workspaceId?: string): Promise<AdminUsersResponse> {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiFetch(`/admin/users${qs}`);
}

export async function addEmailUser(email: string, workspaceId: string): Promise<AdminUser> {
  return apiFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, workspaceId }),
  });
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

export async function linkName(userId: string, nameUserId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/users/${userId}/link`, {
    method: 'POST',
    body: JSON.stringify({ nameUserId }),
  });
}

export async function unlinkName(userId: string, nameId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/admin/users/${userId}/unlink/${nameId}`, { method: 'DELETE' });
}
