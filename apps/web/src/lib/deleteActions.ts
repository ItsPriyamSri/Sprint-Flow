import type { QueryClient } from '@tanstack/react-query';
import { confirm } from '@/store/confirm.store';
import { deleteSprint } from '@/lib/api/sprints';
import { deleteProject } from '@/lib/api/projects';
import { invalidateProjectScopedQueries } from '@/lib/queryInvalidation';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export async function confirmDeleteSprint(opts: {
  sprintId: string;
  sprintName: string;
  workspaceId: string;
  projectId?: string | null;
  queryClient: QueryClient;
  onDeleted?: () => void;
}): Promise<boolean> {
  const ok = await confirm({
    title: `Delete sprint "${opts.sprintName}"?`,
    message:
      'This permanently removes the sprint. Sprints with tasks cannot be deleted — move or remove tasks first.',
    confirmLabel: 'Delete sprint',
    variant: 'danger',
  });
  if (!ok) return false;

  try {
    await deleteSprint(opts.sprintId, opts.workspaceId);
    invalidateProjectScopedQueries(opts.queryClient, opts.projectId);
    opts.onDeleted?.();
    return true;
  } catch (err) {
    window.alert(errorMessage(err));
    return false;
  }
}

export async function confirmDeleteProject(opts: {
  projectId: string;
  projectName: string;
  queryClient: QueryClient;
  sprintCount?: number;
  epicCount?: number;
  onDeleted?: () => void;
}): Promise<boolean> {
  const sprintLine =
    opts.sprintCount !== undefined
      ? `\n• ${opts.sprintCount} sprint${opts.sprintCount === 1 ? '' : 's'}`
      : '\n• All sprints';
  const epicLine =
    opts.epicCount !== undefined
      ? `\n• ${opts.epicCount} epic${opts.epicCount === 1 ? '' : 's'}`
      : '\n• All epics';

  const ok = await confirm({
    title: `Permanently delete "${opts.projectName}"?`,
    message:
      `This will permanently delete this project and everything inside it, including:` +
      `\n• All tasks and assignments` +
      sprintLine +
      epicLine +
      `\n• All project members\n\nThis action cannot be undone.`,
    confirmLabel: 'Delete project forever',
    cancelLabel: 'Keep project',
    variant: 'danger',
    requireTypedConfirm: 'CONFIRM',
  });
  if (!ok) return false;

  try {
    await deleteProject(opts.projectId);
    invalidateProjectScopedQueries(opts.queryClient, opts.projectId);
    opts.onDeleted?.();
    return true;
  } catch (err) {
    window.alert(errorMessage(err));
    return false;
  }
}
