'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { useProjectStore } from '@/store/project.store';
import { getMyWorkspace } from '@/lib/api/workspaces';
import { uploadWorkbook, updateMapping, getPreview, commitImport } from '@/lib/api/import';
import type { UploadResponse, PreviewResponse, CommitResponse } from '@/lib/api/import';
import { Step1Upload } from './Step1Upload';
import { Step2Mapping } from './Step2Mapping';
import { Step3Preview } from './Step3Preview';
import { Step4Commit } from './Step4Commit';

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1, label: 'Upload' },
  { n: 2, label: 'Mapping' },
  { n: 3, label: 'Preview' },
  { n: 4, label: 'Done' },
];

export function ImportWizard() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const storedWorkspaceId = useAuthStore((s) => s.defaultWorkspaceId);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commit, setCommit] = useState<CommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: getMyWorkspace,
    enabled: !!accessToken,
    staleTime: 60_000,
  });

  const workspaceId = storedWorkspaceId ?? workspace?.id ?? '';

  const targetProject =
    workspace?.projects?.find((p) => p.id === activeProjectId) ??
    workspace?.projects?.[0] ??
    null;

  const clearError = () => setError(null);

  const resolveProjectId = (): string | null =>
    activeProjectId ?? workspace?.projects?.[0]?.id ?? null;

  const requireWorkspaceId = (): string => {
    const id = workspaceId || workspace?.id;
    if (!id) throw new Error('Workspace is still loading — wait a moment and try again.');
    return id;
  };

  // Step 1 → upload + parse
  const uploadMutation = useMutation({
    mutationFn: (f: File) => uploadWorkbook(f, requireWorkspaceId()),
    onSuccess: (data) => { setUpload(data); setStep(2); clearError(); },
    onError: (e: Error) => setError(e.message),
  });

  // Step 2 → update mapping + fetch preview
  const mappingMutation = useMutation({
    mutationFn: async (columnMap: Record<string, string>) => {
      const wsId = requireWorkspaceId();
      await updateMapping(upload!.importId, wsId, columnMap);
      return getPreview(upload!.importId, wsId);
    },
    onSuccess: (data) => { setPreview(data); setStep(3); clearError(); },
    onError: (e: Error) => setError(e.message),
  });

  // Step 3 → commit
  const commitMutation = useMutation({
    mutationFn: (newProjectName?: string) => {
      if (newProjectName) {
        return commitImport(upload!.importId, requireWorkspaceId(), {
          createSprints: true,
          createEpics: true,
          newProjectName,
        });
      }
      const projectId = resolveProjectId();
      if (!projectId) {
        throw new Error('Create or select a project before importing.');
      }
      return commitImport(upload!.importId, requireWorkspaceId(), {
        createSprints: true,
        createEpics: true,
        projectId,
      });
    },
    onSuccess: async (data) => {
      const projectId = data.projectId ?? resolveProjectId();
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      if (projectId) {
        await queryClient.invalidateQueries({ queryKey: ['project-overview', projectId] });
        await queryClient.invalidateQueries({ queryKey: ['backlog', projectId] });
      }
      const refreshed = await queryClient.fetchQuery({
        queryKey: ['workspace'],
        queryFn: getMyWorkspace,
      });
      const proj =
        refreshed.projects?.find((p) => p.id === (projectId ?? activeProjectId)) ??
        refreshed.projects?.[0];
      if (proj) setActiveProject(proj);
      setCommit(data);
      setStep(4);
      clearError();
    },
    onError: (e: Error) => setError(e.message),
  });

  const reset = () => {
    setStep(1); setFile(null); setUpload(null); setPreview(null); setCommit(null); clearError();
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition ${
                  step > s.n
                    ? 'bg-indigo-600 text-white'
                    : step === s.n
                    ? 'border-2 border-indigo-600 text-indigo-600'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {step > s.n ? '✓' : s.n}
              </div>
              <span className={`mt-1 text-xs ${step === s.n ? 'font-medium text-indigo-600' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mb-4 h-0.5 w-16 ${step > s.n ? 'bg-indigo-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step panels */}
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {step === 1 && (
          <Step1Upload
            onUploaded={(f) => { setFile(f); uploadMutation.mutate(f); }}
            loading={uploadMutation.isPending}
            error={error}
          />
        )}

        {step === 2 && upload && (
          <Step2Mapping
            upload={upload}
            onConfirm={(map) => mappingMutation.mutate(map)}
            onBack={() => { setStep(1); clearError(); }}
            loading={mappingMutation.isPending}
            error={error}
          />
        )}

        {step === 3 && preview && (
          <Step3Preview
            preview={preview}
            targetProjectName={targetProject?.name ?? null}
            canCommit={!!resolveProjectId()}
            onCommit={(newProjectName) => commitMutation.mutate(newProjectName)}
            onBack={() => { setStep(2); clearError(); }}
            loading={commitMutation.isPending}
            error={error}
          />
        )}

        {step === 4 && commit && (
          <Step4Commit
            result={commit}
            filename={file?.name ?? 'workbook'}
            onImportAnother={reset}
          />
        )}
      </div>
    </div>
  );
}
