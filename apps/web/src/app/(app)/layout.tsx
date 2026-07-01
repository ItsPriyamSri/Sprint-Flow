'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { useProjectStore } from '@/store/project.store';
import { listMyTeams, hydrateTeam } from '@/lib/api/workspaces';
import { Sidebar } from '@/components/layout/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const mustChangePassword = useAuthStore((s) => s.user?.mustChangePassword);
  const pathname = usePathname();
  const { activeProjectId, setActiveProject, setActiveProjectId } = useProjectStore();
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace);

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

  // 1. List all teams the user belongs to
  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: listMyTeams,
    enabled: !!accessToken && !mustChangePassword,
    staleTime: 60_000,
  });

  // 2. Pick the active workspace: use persisted one if still valid, otherwise first
  const resolvedWorkspaceId = (() => {
    if (!teams) return activeWorkspaceId;
    if (teams.length === 0) return null;
    const persisted = teams.find((t) => t.id === activeWorkspaceId);
    return (persisted ?? teams[0])?.id ?? null;
  })();

  // 3. Hydrate the active team's projects/sprints/epics
  const { data: workspace } = useQuery({
    queryKey: ['workspace', resolvedWorkspaceId],
    queryFn: () => hydrateTeam(resolvedWorkspaceId!),
    enabled: !!resolvedWorkspaceId,
    staleTime: 60_000,
  });

  // Sync activeWorkspaceId + role into store whenever the hydrated workspace changes.
  // Always overwrite so a server-side role change (e.g. promoted to OWNER) is reflected
  // without requiring a logout.
  useEffect(() => {
    if (workspace) {
      setActiveWorkspace(workspace.id, workspace.role);
    }
  }, [workspace, setActiveWorkspace]);

  // Auto-select first project if none active
  useEffect(() => {
    if (!workspace?.projects?.length) return;
    const first = workspace.projects[0];
    if (!first) return;
    if (!activeProjectId) {
      setActiveProjectId(first.id);
    }
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

  // Show "not in a team" screen once we know the teams list is empty
  if (!teamsLoading && teams && teams.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-8 w-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Not assigned to a team yet</h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            You are not assigned to any team. Please contact your team lead or an administrator to be added.
          </p>
        </div>
        <button
          onClick={() => {
            useAuthStore.getState().clearAuth();
            router.push('/login');
          }}
          className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar workspace={workspace ?? null} teams={teams ?? []} />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
