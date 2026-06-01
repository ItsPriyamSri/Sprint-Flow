import { apiFetch } from './client';

export interface UploadResponse {
  importId: string;
  detectedSheet: string;
  headerRowIndex: number;
  columnMap: Record<string, string>;
  stats: ImportStats;
}

export interface ImportStats {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
  skipped: number;
  sprints: number;
  epics: number;
  owners: number;
}

export interface ImportRow {
  id: string;
  rowIndex: number;
  raw: Record<string, string | null>;
  normalized: Record<string, unknown>;
  status: 'VALID' | 'WARNING' | 'ERROR' | 'SKIPPED' | 'COMMITTED';
  messages: Array<{ level: string; field?: string; message: string }>;
  createdTaskId: string | null;
}

export interface PreviewResponse {
  import: {
    id: string;
    filename: string;
    status: string;
    detectedSheet: string | null;
    headerRowIndex: number | null;
    columnMap: Record<string, string> | null;
    stats: ImportStats | null;
    createdAt: string;
  };
  rows: ImportRow[];
}

export interface CommitResponse {
  committed: number;
  skipped: number;
  errors: number;
  boardId: string;
  projectId?: string;
}

export async function uploadWorkbook(
  file: File,
  workspaceId: string,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/imports?workspaceId=${workspaceId}`, {
    method: 'POST',
    body: form,
  });
}

export async function getPreview(
  importId: string,
  workspaceId: string,
  statusFilter?: string,
): Promise<PreviewResponse> {
  const params = new URLSearchParams({ workspaceId });
  if (statusFilter) params.set('status', statusFilter);
  return apiFetch(`/imports/${importId}/preview?${params}`);
}

export async function updateMapping(
  importId: string,
  workspaceId: string,
  columnMap: Record<string, string>,
): Promise<{ columnMap: Record<string, string>; stats: ImportStats }> {
  return apiFetch(`/imports/${importId}/mapping?workspaceId=${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ columnMap }),
  });
}

export async function commitImport(
  importId: string,
  workspaceId: string,
  opts: { createSprints: boolean; createEpics: boolean; projectId?: string },
): Promise<CommitResponse> {
  return apiFetch(`/imports/${importId}/commit?workspaceId=${workspaceId}`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function rollbackImport(
  importId: string,
  workspaceId: string,
): Promise<{ deletedTasks: number }> {
  return apiFetch(`/imports/${importId}/rollback?workspaceId=${workspaceId}`, {
    method: 'POST',
  });
}
