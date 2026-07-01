'use client';

import { useAuthStore } from '@/store/auth.store';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspaceRole = useAuthStore((s) => s.activeWorkspaceRole);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  /** True if the caller is a team lead (OWNER or ADMIN) in the active workspace */
  const isTeamLead =
    isSuperAdmin ||
    activeWorkspaceRole === 'OWNER' ||
    activeWorkspaceRole === 'ADMIN';

  function isLead(projectId: string): boolean {
    if (isSuperAdmin || isTeamLead) return true;
    return (
      user?.projectMemberships?.some(
        (pm) => pm.projectId === projectId && pm.role === 'LEAD',
      ) ?? false
    );
  }

  function isProjectMember(projectId: string): boolean {
    if (isSuperAdmin) return true;
    return user?.projectMemberships?.some((pm) => pm.projectId === projectId) ?? false;
  }

  return {
    isSuperAdmin,
    isTeamLead,
    isLead,
    isProjectMember,
    user: user as { role: string; projectMemberships?: Array<{ projectId: string; role: string }> } | null,
  };
}
