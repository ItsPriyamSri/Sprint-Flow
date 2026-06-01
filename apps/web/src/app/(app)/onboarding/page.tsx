'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { useProjectStore } from '@/store/project.store';
import { createProject } from '@/lib/api/projects';
import { listWorkspaceUsers } from '@/lib/api/users';
import type { ProjectDto } from '@sprintflow/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemberInput {
  userId: string;
  name: string;
  email: string;
  role: 'LEAD' | 'MEMBER' | 'VIEWER';
  hoursPerDay: number;
}

interface SprintInput {
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  releaseMilestone: boolean;
  releaseLabel: string;
  releaseDate: string;
}

interface WizardState {
  // Step 1 – Project basics
  name: string;
  description: string;
  daysPerWeek: number;
  daysPerSprint: number;
  members: MemberInput[];
  // Step 2 – Sprint structure
  sprints: SprintInput[];
  // Step 3 – Release milestones (inline editing)
  // Step 4 – Review
}

const STEPS = [
  { id: 1, label: 'Basics & capacity' },
  { id: 2, label: 'Sprint structure' },
  { id: 3, label: 'Releases' },
  { id: 4, label: 'Review' },
];

// ─── Step 1: Basics ───────────────────────────────────────────────────────────

function StepBasics({
  state, update, currentUserId, currentUserName, currentUserEmail, workspaceId,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
  workspaceId: string;
}) {
  const { data: usersResult } = useQuery({
    queryKey: ['users', workspaceId],
    queryFn: () => listWorkspaceUsers(workspaceId),
    enabled: !!workspaceId,
  });

  const availableToAdd = (usersResult?.data ?? []).filter(
    (u) => u.id !== currentUserId && !state.members.some((m) => m.userId === u.id),
  );

  const updateMember = (idx: number, patch: Partial<MemberInput>) => {
    const members = [...state.members];
    members[idx] = { ...members[idx]!, ...patch };
    update({ members });
  };
  const addMemberById = (userId: string) => {
    const u = usersResult?.data.find((x) => x.id === userId);
    if (!u) return;
    update({
      members: [
        ...state.members,
        {
          userId: u.id,
          name: u.name,
          email: u.email ?? '',
          role: 'MEMBER',
          hoursPerDay: 6,
        },
      ],
    });
  };
  const removeMember = (idx: number) => {
    update({ members: state.members.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Project name *</label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. CARR Release 2"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <textarea
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={2}
          placeholder="Optional project description"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Days per sprint</label>
          <input
            type="number" min={1} max={30}
            value={state.daysPerSprint}
            onChange={(e) => update({ daysPerSprint: parseInt(e.target.value, 10) || 6 })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Working days/week</label>
          <input
            type="number" min={1} max={7}
            value={state.daysPerWeek}
            onChange={(e) => update({ daysPerWeek: parseInt(e.target.value, 10) || 6 })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-slate-700">Team members</label>
          {availableToAdd.length > 0 ? (
            <select
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  addMemberById(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="">+ Add workspace member…</option>
              {availableToAdd.map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.email ? ` (${u.email})` : ''}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-slate-400">All workspace members added</span>
          )}
        </div>
        <div className="space-y-2">
          {state.members.map((m, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex-1 min-w-0">
                {m.userId === currentUserId ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{m.name}</span>
                    <span className="text-xs text-slate-400">{m.email}</span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">You</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">{m.name}</span>
                    {m.email && <span className="text-xs text-slate-400">{m.email}</span>}
                  </div>
                )}
              </div>
              <select
                value={m.role}
                onChange={(e) => updateMember(idx, { role: e.target.value as MemberInput['role'] })}
                className="rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none"
              >
                <option value="LEAD">Lead</option>
                <option value="MEMBER">Member</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={0.5} max={24} step={0.5}
                  value={m.hoursPerDay}
                  onChange={(e) => updateMember(idx, { hoursPerDay: parseFloat(e.target.value) || 6 })}
                  className="w-14 rounded border border-slate-200 px-1.5 py-1 text-xs focus:outline-none"
                />
                <span className="text-xs text-slate-400">h/day</span>
              </div>
              {m.userId !== currentUserId && (
                <button onClick={() => removeMember(idx)} className="text-slate-300 hover:text-red-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Add existing workspace members from the dropdown. Invite new users from workspace settings first.
        </p>
      </div>
    </div>
  );
}

// ─── Step 2: Sprint structure ─────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]!;
}

function StepSprints({ state, update }: { state: WizardState; update: (patch: Partial<WizardState>) => void }) {
  const [sprintCount, setSprintCount] = useState(state.sprints.length || 4);

  const autoFill = () => {
    const first = state.sprints[0];
    const startBase = first?.startDate ?? new Date().toISOString().split('T')[0]!;
    const sprints = Array.from({ length: sprintCount }, (_, i) => {
      const startDate = i === 0 ? startBase : addDays(startBase, i * (state.daysPerSprint + 1));
      const endDate = addDays(startDate, state.daysPerSprint - 1);
      const existing = state.sprints[i];
      return {
        name: existing?.name || `Sprint ${i + 1}`,
        goal: existing?.goal ?? '',
        startDate: existing?.startDate || startDate,
        endDate: existing?.endDate || endDate,
        releaseMilestone: existing?.releaseMilestone ?? false,
        releaseLabel: existing?.releaseLabel ?? '',
        releaseDate: existing?.releaseDate ?? '',
      };
    });
    update({ sprints });
  };

  const updateSprint = (idx: number, patch: Partial<SprintInput>) => {
    const sprints = [...state.sprints];
    sprints[idx] = { ...sprints[idx]!, ...patch };
    update({ sprints });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Number of sprints</label>
          <input
            type="number" min={1} max={12}
            value={sprintCount}
            onChange={(e) => setSprintCount(parseInt(e.target.value, 10) || 1)}
            className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">Sprint 1 start date</label>
          <input
            type="date"
            value={state.sprints[0]?.startDate ?? ''}
            onChange={(e) => {
              const sprints = [...state.sprints];
              if (sprints[0]) sprints[0] = { ...sprints[0], startDate: e.target.value };
              update({ sprints });
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={autoFill}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Auto-fill dates →
        </button>
      </div>

      <div className="space-y-2">
        {Array.from({ length: sprintCount }, (_, i) => {
          const s = state.sprints[i] ?? { name: `Sprint ${i + 1}`, goal: '', startDate: '', endDate: '', releaseMilestone: false, releaseLabel: '', releaseDate: '' };
          return (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <input
                    type="text" placeholder={`Sprint ${i + 1}`}
                    value={s.name}
                    onChange={(e) => updateSprint(i, { name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div className="col-span-4">
                  <input
                    type="text" placeholder="One-line goal…"
                    value={s.goal}
                    onChange={(e) => updateSprint(i, { goal: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="date"
                    value={s.startDate}
                    onChange={(e) => updateSprint(i, { startDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="date"
                    value={s.endDate}
                    onChange={(e) => updateSprint(i, { endDate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 3: Releases ─────────────────────────────────────────────────────────

function StepReleases({ state, update }: { state: WizardState; update: (patch: Partial<WizardState>) => void }) {
  const updateSprint = (idx: number, patch: Partial<SprintInput>) => {
    const sprints = [...state.sprints];
    sprints[idx] = { ...sprints[idx]!, ...patch };
    update({ sprints });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Mark which sprints are release milestones and set their labels and dates.
      </p>
      <div className="space-y-2">
        {state.sprints.map((s, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <input
              type="checkbox"
              id={`rel-${i}`}
              checked={s.releaseMilestone}
              onChange={(e) => updateSprint(i, { releaseMilestone: e.target.checked })}
              className="h-4 w-4 accent-indigo-600"
            />
            <label htmlFor={`rel-${i}`} className="w-24 text-sm font-medium text-slate-700 cursor-pointer">
              {s.name}
            </label>
            {s.releaseMilestone && (
              <>
                <input
                  type="text"
                  placeholder='Label e.g. "Release 1"'
                  value={s.releaseLabel}
                  onChange={(e) => updateSprint(i, { releaseLabel: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <input
                  type="date"
                  value={s.releaseDate}
                  onChange={(e) => updateSprint(i, { releaseDate: e.target.value })}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                />
              </>
            )}
            {!s.releaseMilestone && (
              <span className="text-xs text-slate-300 italic">Not a release</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function StepReview({ state }: { state: WizardState }) {
  const weeklyBudget = state.members.reduce((s, m) => s + m.hoursPerDay * state.daysPerWeek, 0);
  const releases = state.sprints.filter((s) => s.releaseMilestone);
  const firstRelease = releases[0];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3">
        <h3 className="font-semibold text-slate-800">{state.name}</h3>
        {state.description && <p className="text-sm text-slate-500">{state.description}</p>}
        <div className="grid grid-cols-3 gap-4 pt-1">
          <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold text-slate-900">{state.sprints.length}</p>
            <p className="text-xs text-slate-400">sprints</p>
          </div>
          <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold text-slate-900">{weeklyBudget}h</p>
            <p className="text-xs text-slate-400">budget/week</p>
          </div>
          <div className="rounded-lg bg-white border border-slate-200 p-3 text-center">
            <p className="text-2xl font-bold text-slate-900">{releases.length}</p>
            <p className="text-xs text-slate-400">releases</p>
          </div>
        </div>
        {firstRelease?.releaseDate && (
          <p className="text-sm text-indigo-600 font-medium">
            {firstRelease.releaseLabel || 'First release'} on {new Date(firstRelease.releaseDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium text-slate-600">Team</h4>
        <div className="space-y-1">
          {state.members.map((m, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                {m.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 text-sm text-slate-700">{m.name || 'Unnamed'}</span>
              <span className="text-xs text-slate-400">{m.role}</span>
              <span className="font-mono text-xs text-slate-500">{m.hoursPerDay}h/day</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-medium text-slate-600">Sprints</h4>
        <div className="space-y-1">
          {state.sprints.map((s, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <span className="text-sm font-medium text-slate-700">{s.name}</span>
              {s.releaseMilestone && (
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">
                  {s.releaseLabel || 'Release'}
                </span>
              )}
              {s.goal && <span className="flex-1 truncate text-xs text-slate-400">{s.goal}</span>}
              {(s.startDate || s.endDate) && (
                <span className="text-xs text-slate-400">
                  {s.startDate || '?'} → {s.endDate || '?'}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Wizard shell ─────────────────────────────────────────────────────────────

function buildCreateInput(state: WizardState, workspaceId: string) {
  return {
    workspaceId,
    name: state.name,
    description: state.description || undefined,
    daysPerSprint: state.daysPerSprint,
    daysPerWeek: state.daysPerWeek,
    members: state.members.filter((m) => m.userId).map((m) => ({
      userId: m.userId,
      role: m.role,
      hoursPerDay: m.hoursPerDay,
    })),
    sprints: state.sprints.map((s) => ({
      name: s.name,
      goal: s.goal || undefined,
      startDate: s.startDate ? new Date(s.startDate).toISOString() : undefined,
      endDate: s.endDate ? new Date(s.endDate).toISOString() : undefined,
      releaseMilestone: s.releaseMilestone,
      releaseLabel: s.releaseLabel || undefined,
      releaseDate: s.releaseDate ? new Date(s.releaseDate).toISOString() : undefined,
    })),
    epicNames: ['Infrastructure', 'Frontend', 'Backend', 'QA'],
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const workspaceId = useAuthStore((s) => s.defaultWorkspaceId) ?? '';
  const setActiveProject = useProjectStore((s) => s.setActiveProject);

  const [step, setStep] = useState(1);
  const [wizardState, setWizardState] = useState<WizardState>({
    name: '',
    description: '',
    daysPerWeek: 6,
    daysPerSprint: 6,
    members: [
      {
        userId: user?.id ?? '',
        name: user?.name ?? '',
        email: user?.email ?? '',
        role: 'LEAD',
        hoursPerDay: 6,
      },
    ],
    sprints: [
      { name: 'Sprint 1', goal: '', startDate: '', endDate: '', releaseMilestone: false, releaseLabel: '', releaseDate: '' },
      { name: 'Sprint 2', goal: '', startDate: '', endDate: '', releaseMilestone: false, releaseLabel: '', releaseDate: '' },
      { name: 'Sprint 3', goal: '', startDate: '', endDate: '', releaseMilestone: false, releaseLabel: '', releaseDate: '' },
      { name: 'Sprint 4', goal: '', startDate: '', endDate: '', releaseMilestone: true, releaseLabel: 'Release 1', releaseDate: '' },
    ],
  });

  const update = (patch: Partial<WizardState>) => setWizardState((s) => ({ ...s, ...patch }));

  const createMutation = useMutation({
    mutationFn: () => createProject(buildCreateInput(wizardState, workspaceId)),
    onSuccess: (project: ProjectDto) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace'] });
      setActiveProject(project);
      router.push('/overview');
    },
  });

  const canAdvance = () => {
    if (step === 1) return wizardState.name.trim().length > 0;
    if (step === 2) return wizardState.sprints.length > 0 && wizardState.sprints.every((s) => s.name.trim());
    return true;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50">
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        {/* Steps */}
        <div className="mb-8 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step === s.id
                    ? 'bg-indigo-600 text-white'
                    : step > s.id
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-slate-200 text-slate-400'
                }`}
              >
                {step > s.id ? '✓' : s.id}
              </div>
              <span className={`text-xs ${step === s.id ? 'font-medium text-slate-800' : 'text-slate-400'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <div className="h-px w-6 bg-slate-200" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-bold text-slate-900">
            {STEPS[step - 1]?.label}
          </h2>

          {step === 1 && (
            <StepBasics
              state={wizardState}
              update={update}
              currentUserId={user?.id ?? ''}
              currentUserName={user?.name ?? ''}
              currentUserEmail={user?.email ?? ''}
              workspaceId={workspaceId}
            />
          )}
          {step === 2 && <StepSprints state={wizardState} update={update} />}
          {step === 3 && <StepReleases state={wizardState} update={update} />}
          {step === 4 && <StepReview state={wizardState} />}

          {createMutation.isError && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {(createMutation.error as Error).message}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (step === 1) router.push('/overview');
                else setStep((s) => s - 1);
              }}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100"
            >
              {step === 1 ? 'Cancel' : '← Back'}
            </button>

            {step < 4 ? (
              <button
                type="button"
                disabled={!canAdvance()}
                onClick={() => setStep((s) => s + 1)}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating…' : 'Create project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
