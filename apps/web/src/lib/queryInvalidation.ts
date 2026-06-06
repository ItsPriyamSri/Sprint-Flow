import type { QueryClient } from '@tanstack/react-query';

/** Refresh workspace, project views, sprint boards, backlog, and activity after structural changes. */
export function invalidateProjectScopedQueries(
  queryClient: QueryClient,
  projectId?: string | null,
) {
  void queryClient.invalidateQueries({ queryKey: ['workspace'] });
  void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
  void queryClient.invalidateQueries({ queryKey: ['board'] });
  void queryClient.invalidateQueries({ queryKey: ['activity'] });
  if (projectId) {
    void queryClient.invalidateQueries({ queryKey: ['project-overview', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-dashboard', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-epics', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
  }
}
