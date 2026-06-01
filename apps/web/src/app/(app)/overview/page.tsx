'use client';

import { useQuery } from '@tanstack/react-query';
import { useProjectStore } from '@/store/project.store';
import { getProject } from '@/lib/api/projects';
import { ProjectOverview } from '@/components/overview/ProjectOverview';

export default function OverviewPage() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['project-overview', activeProjectId],
    queryFn: () => getProject(activeProjectId!),
    enabled: !!activeProjectId,
    staleTime: 30_000,
  });

  if (!activeProjectId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
          <svg className="h-8 w-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-slate-700">No project selected</p>
        <p className="text-sm text-slate-500">Create a project to get started with sprint planning.</p>
        <a href="/onboarding"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          Create project
        </a>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Failed to load project overview.
      </div>
    );
  }

  return <ProjectOverview data={data} />;
}
