'use client';

import { useAuthStore } from '@/store/auth.store';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  function isLead(projectId: string): boolean {
    if (isSuperAdmin) return true;
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
    isLead,
    isProjectMember,
    user: user as { role: string; projectMemberships?: Array<{ projectId: string; role: string }> } | null,
  };
}
