'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { getSprintBoard } from '@/lib/api/projects';
import { SprintBoardView } from '@/components/scrum/SprintBoardView';

export default function SprintBoardPage({ params }: { params: Promise<{ sprintId: string }> }) {
  const { sprintId } = use(params);
  const workspaceId = useAuthStore((s) => s.defaultWorkspaceId) ?? '';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sprint-board', sprintId],
    queryFn: () => getSprintBoard(sprintId, workspaceId),
    enabled: !!sprintId && !!workspaceId,
    staleTime: 10_000,
  });

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
        Failed to load sprint board.
      </div>
    );
  }

  return <SprintBoardView board={data} workspaceId={workspaceId} onRefresh={() => void refetch()} />;
}
