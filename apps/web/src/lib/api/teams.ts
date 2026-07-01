import { apiFetch } from './client';
import type { AdminUser, AdminUsersResponse } from './admin';

export interface TeamInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  projectCount: number;
  leads: Array<{ userId: string; name: string; email: string | null; role: string }>;
}

export interface TeamMember {
  id: string;
  teamRole: string;
  joinedAt: string;
  user: AdminUser;
}

export interface TeamMembersResponse {
  members: TeamMember[];
  unlinkedNames: Array<{ id: string; name: string }>;
}

// ── Team CRUD (super admin) ───────────────────────────────────────────────────

export async function listAllTeams(): Promise<TeamInfo[]> {
  return apiFetch('/teams');
}

export async function createTeam(data: {
  name: string;
  slug: string;
  description?: string;
  leadEmail?: string;
}): Promise<{ id: string; name: string; slug: string; description: string | null }> {
  return apiFetch('/teams', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTeam(teamId: string, data: { name?: string; description?: string }) {
  return apiFetch(`/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTeam(teamId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/teams/${encodeURIComponent(teamId)}`, { method: 'DELETE' });
}

// ── Team member management ────────────────────────────────────────────────────

export async function getTeamMembers(teamId: string): Promise<TeamMembersResponse> {
  return apiFetch(`/teams/${encodeURIComponent(teamId)}/members`);
}

export async function addTeamMember(
  teamId: string,
  email: string,
  teamRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER',
): Promise<TeamMember> {
  return apiFetch(`/teams/${encodeURIComponent(teamId)}/members`, {
    method: 'POST',
    body: JSON.stringify({ email, teamRole }),
  });
}

export async function removeTeamMember(teamId: string, userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function setTeamMemberRole(
  teamId: string,
  userId: string,
  teamRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER',
): Promise<{ id: string; userId: string; teamRole: string }> {
  return apiFetch(`/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ teamRole }),
  });
}

// ── Team-scoped admin actions (usable by team leads) ─────────────────────────

export async function listTeamUsers(workspaceId: string): Promise<AdminUsersResponse> {
  return apiFetch(`/admin/users?workspaceId=${encodeURIComponent(workspaceId)}`);
}

export async function addUserToTeam(email: string, workspaceId: string) {
  return apiFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, workspaceId }),
  });
}

export async function setTeamProjectLead(
  userId: string,
  projectId: string,
  role: 'LEAD' | 'MEMBER' | 'VIEWER',
  workspaceId: string,
) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/lead`, {
    method: 'PATCH',
    body: JSON.stringify({ projectId, role, workspaceId }),
  });
}

export async function resetTeamMemberPassword(userId: string, workspaceId: string) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/reset-password?workspaceId=${encodeURIComponent(workspaceId)}`, {
    method: 'POST',
  });
}

export async function deactivateTeamMember(userId: string, status: 'ACTIVE' | 'DEACTIVATED', workspaceId: string) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, workspaceId }),
  });
}

export async function linkNameForTeam(userId: string, nameUserId: string, workspaceId: string) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/link`, {
    method: 'POST',
    body: JSON.stringify({ nameUserId, workspaceId }),
  });
}

export async function unlinkNameForTeam(userId: string, nameId: string) {
  return apiFetch(`/admin/users/${encodeURIComponent(userId)}/unlink/${encodeURIComponent(nameId)}`, {
    method: 'DELETE',
  });
}
