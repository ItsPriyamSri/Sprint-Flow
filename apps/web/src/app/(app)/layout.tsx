'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { useProjectStore } from '@/store/project.store';
import { getMyWorkspace } from '@/lib/api/workspaces';
import { Sidebar } from '@/components/layout/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const mustChangePassword = useAuthStore((s) => s.user?.mustChangePassword);
  const pathname = usePathname();
  const { activeProjectId, setActiveProject, setActiveProjectId } = useProjectStore();

  // Redirect to login if unauthenticated after hydration
  useEffect(() => {
    if (hasHydrated && !accessToken) {
      router.replace('/login');
    }
  }, [hasHydrated, accessToken, router]);

  // Block app until password is changed
  useEffect(() => {
    if (hasHydrated && accessToken && mustChangePassword && pathname !== '/settings/password') {
      router.replace('/settings/password');
    }
  }, [hasHydrated, accessToken, mustChangePassword, pathname, router]);

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: getMyWorkspace,
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  // Auto-select first project if none active
  useEffect(() => {
    if (!workspace?.projects?.length) return;
    const first = workspace.projects[0];
    if (!first) return;
    if (!activeProjectId) {
      setActiveProjectId(first.id);
    }
    // Always sync active project from workspace data
    const proj = workspace.projects.find((p) => p.id === activeProjectId) ?? first;
    if (proj) setActiveProject(proj);
  }, [workspace, activeProjectId, setActiveProject, setActiveProjectId]);

  if (!hasHydrated || !accessToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (mustChangePassword) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar workspace={workspace ?? null} />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
