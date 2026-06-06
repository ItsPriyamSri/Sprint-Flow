import type { QueryClient } from '@tanstack/react-query';

/** Refresh workspace, project views, sprint boards, and backlog after structural changes. */
export function invalidateProjectScopedQueries(
  queryClient: QueryClient,
  projectId?: string | null,
) {
  void queryClient.invalidateQueries({ queryKey: ['workspace'] });
  void queryClient.invalidateQueries({ queryKey: ['sprint-board'] });
  void queryClient.invalidateQueries({ queryKey: ['board'] });
  if (projectId) {
    void queryClient.invalidateQueries({ queryKey: ['project-overview', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-dashboard', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['project-epics', projectId] });
    void queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
  }
}
