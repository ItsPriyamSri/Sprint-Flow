'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectStore } from '@/store/project.store';
import {
  getTeamMembers,
  addTeamMember,
  removeTeamMember,
  setTeamMemberRole,
  setTeamProjectLead,
  resetTeamMemberPassword,
  deactivateTeamMember,
  linkNameForTeam,
  unlinkNameForTeam,
  type TeamMember,
} from '@/lib/api/teams';
import { updateTeam } from '@/lib/api/teams';

function LinkDropdown({
  userId,
  unlinkedNames,
  onLink,
}: {
  userId: string;
  unlinkedNames: Array<{ id: string; name: string }>;
  onLink: (nameUserId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (unlinkedNames.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
      >
        + link name
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {unlinkedNames.map((n) => (
            <button
              key={n.id}
              onClick={() => { onLink(n.id); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              {n.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  unlinkedNames,
  activeProjectId,
  workspaceId,
  onRoleChange,
  onProjectLead,
  onStatus,
  onReset,
  onRemove,
  onLink,
  onUnlink,
  feedback,
  isSuperAdmin,
}: {
  member: TeamMember;
  unlinkedNames: Array<{ id: string; name: string }>;
  activeProjectId: string | undefined;
  workspaceId: string;
  onRoleChange: (userId: string, role: 'MEMBER' | 'VIEWER') => void;
  onProjectLead: (userId: string, role: 'LEAD' | 'MEMBER') => void;
  onStatus: (userId: string, status: 'ACTIVE' | 'DEACTIVATED') => void;
  onReset: (userId: string) => void;
  onRemove: (userId: string) => void;
  onLink: (userId: string, nameUserId: string) => void;
  onUnlink: (userId: string, nameId: string) => void;
  feedback: string | null;
  isSuperAdmin: boolean;
}) {
  const { user } = member;
  const isTeamLead = member.teamRole === 'OWNER' || member.teamRole === 'ADMIN';
  const isDeactivated = user.status === 'DEACTIVATED';
  const isPending = user.mustChangePassword && !isDeactivated;
  const pm = activeProjectId
    ? user.projectMemberships?.find((m) => m.projectId === activeProjectId)
    : null;
  const isProjectLead = pm?.role === 'LEAD';

  return (
    <div className={`rounded-xl border bg-white px-4 py-3 transition-colors ${isDeactivated ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isTeamLead ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {(user.email ?? user.name ?? 'U').charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 text-sm break-all">{user.email ?? user.name}</span>
            {isTeamLead && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-violet-100 text-violet-700">
                {member.teamRole === 'OWNER' ? 'LEAD' : 'CO-LEAD'}
              </span>
            )}
            {isPending && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">TEMP PW</span>
            )}
            {isDeactivated && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700">DEACTIVATED</span>
            )}
          </div>

          {/* Linked names */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(user.linkedNames ?? []).map((n) => (
              <span
                key={n.id}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {n.name}
                <button
                  onClick={() => onUnlink(user.id, n.id)}
                  className="text-slate-300 hover:text-slate-500 transition-colors leading-none"
                  title={`Unlink ${n.name}`}
                >×</button>
              </span>
            ))}
            <LinkDropdown
              userId={user.id}
              unlinkedNames={unlinkedNames}
              onLink={(nameUserId) => onLink(user.id, nameUserId)}
            />
          </div>

          {feedback && <p className="mt-1 text-xs text-green-600">{feedback}</p>}
        </div>

        {/* Project role */}
        {activeProjectId && (
          <div className="hidden flex-shrink-0 sm:flex flex-col items-center gap-0.5 min-w-[56px]">
            <span className="text-[10px] text-slate-400">Project</span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${isProjectLead ? 'bg-indigo-100 text-indigo-700' : pm ? 'bg-slate-100 text-slate-600' : 'text-slate-400'}`}>
              {isProjectLead ? 'LEAD' : pm?.role ?? 'none'}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
          {activeProjectId && !isTeamLead && (
            <button
              onClick={() => onProjectLead(user.id, isProjectLead ? 'MEMBER' : 'LEAD')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${isProjectLead ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
            >
              {isProjectLead ? 'Demote' : 'Make Lead'}
            </button>
          )}
          {/* Team leads can only change MEMBER/VIEWER roles; OWNER/ADMIN requires super admin */}
          {!isTeamLead && (
            <button
              onClick={() => onRoleChange(user.id, member.teamRole === 'MEMBER' ? 'VIEWER' : 'MEMBER')}
              className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
            >
              {member.teamRole === 'MEMBER' ? '→ Viewer' : '→ Member'}
            </button>
          )}
          <button
            onClick={() => onStatus(user.id, isDeactivated ? 'ACTIVE' : 'DEACTIVATED')}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${isDeactivated ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}
          >
            {isDeactivated ? 'Activate' : 'Deactivate'}
          </button>
          <button
            onClick={() => onReset(user.id)}
            className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200 transition-colors"
          >
            Reset PW
          </button>
          {!isTeamLead && (
            <button
              onClick={() => onRemove(user.id)}
              className="rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100 transition-colors"
            >
              Remove
            </button>
          )}
          {isTeamLead && isSuperAdmin && (
            <button
              onClick={() => onRemove(user.id)}
              className="rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamDashboardPage() {
  const { isSuperAdmin, isTeamLead } = usePermissions();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const activeWorkspaceRole = useAuthStore((s) => s.activeWorkspaceRole);
  const activeProject = useProjectStore((s) => s.activeProject);
  const queryClient = useQueryClient();

  const [addEmail, setAddEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  function flash(id: string, msg: string) {
    setFeedback((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => setFeedback((prev) => { const n = { ...prev }; delete n[id]; return n; }), 3000);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['team-members', workspaceId],
    queryFn: () => getTeamMembers(workspaceId!),
    enabled: isTeamLead && !!workspaceId,
  });

  const addMut = useMutation({
    mutationFn: () => addTeamMember(workspaceId!, addEmail.trim().toLowerCase()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', workspaceId] });
      setAddEmail('');
      setAddError('');
    },
    onError: (e: Error) => setAddError(e.message ?? 'Failed to add member'),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeTeamMember(workspaceId!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members', workspaceId] }),
  });

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'MEMBER' | 'VIEWER' }) =>
      setTeamMemberRole(workspaceId!, userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members', workspaceId] }),
  });

  const projectLeadMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'LEAD' | 'MEMBER' }) =>
      setTeamProjectLead(userId, activeProject?.id ?? '', role, workspaceId!),
    onSuccess: (_, { userId, role }) => {
      queryClient.invalidateQueries({ queryKey: ['team-members', workspaceId] });
      flash(userId, role === 'LEAD' ? 'Promoted to Project Lead' : 'Demoted to Member');
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'ACTIVE' | 'DEACTIVATED' }) =>
      deactivateTeamMember(userId, status, workspaceId!),
    onSuccess: (_, { userId, status }) => {
      queryClient.invalidateQueries({ queryKey: ['team-members', workspaceId] });
      flash(userId, status === 'DEACTIVATED' ? 'Deactivated' : 'Activated');
    },
  });

  const resetMut = useMutation({
    mutationFn: (userId: string) => resetTeamMemberPassword(userId, workspaceId!),
    onSuccess: (_, userId) => flash(userId, 'Password reset to default'),
  });

  const linkMut = useMutation({
    mutationFn: ({ userId, nameUserId }: { userId: string; nameUserId: string }) =>
      linkNameForTeam(userId, nameUserId, workspaceId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members', workspaceId] }),
  });

  const unlinkMut = useMutation({
    mutationFn: ({ userId, nameId }: { userId: string; nameId: string }) =>
      unlinkNameForTeam(userId, nameId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['team-members', workspaceId] }),
  });

  const updateTeamMut = useMutation({
    mutationFn: () => updateTeam(workspaceId!, { name: editName, description: editDesc }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      setEditMode(false);
    },
  });

  if (!isTeamLead) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-500">Access denied. Team leads only.</p>
      </div>
    );
  }

  const members = data?.members ?? [];
  const unlinkedNames = data?.unlinkedNames ?? [];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail.trim() || !workspaceId) return;
    if (!addEmail.trim().endsWith('@geti.education')) {
      setAddError('Only @geti.education emails are allowed');
      return;
    }
    addMut.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Team Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage members and roles for your team.
            {activeProject && (
              <> Project role applies to <span className="font-medium text-slate-700">{activeProject.name}</span>.</>
            )}
          </p>
        </div>
        {(activeWorkspaceRole === 'OWNER' || isSuperAdmin) && (
          <button
            onClick={() => setEditMode((m) => !m)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {editMode ? 'Cancel' : 'Edit Team'}
          </button>
        )}
      </div>

      {/* Edit team name/description */}
      {editMode && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Edit Team</p>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Team name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <textarea
              placeholder="Description (optional)"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
            <button
              onClick={() => updateTeamMut.mutate()}
              disabled={!editName.trim() || updateTeamMut.isPending}
              className="self-end rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {updateTeamMut.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Members list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Loading team…
        </div>
      ) : (
        <div className="space-y-2">
          {members.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              No members yet. Add one below.
            </div>
          )}
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              unlinkedNames={unlinkedNames}
              activeProjectId={activeProject?.id}
              workspaceId={workspaceId!}
              onRoleChange={(userId, role) => roleMut.mutate({ userId, role })}
              onProjectLead={(userId, role) => projectLeadMut.mutate({ userId, role })}
              onStatus={(userId, status) => statusMut.mutate({ userId, status })}
              onReset={(userId) => resetMut.mutate(userId)}
              onRemove={(userId) => removeMut.mutate(userId)}
              onLink={(userId, nameUserId) => linkMut.mutate({ userId, nameUserId })}
              onUnlink={(userId, nameId) => unlinkMut.mutate({ userId, nameId })}
              feedback={feedback[m.user.id] ?? null}
              isSuperAdmin={isSuperAdmin}
            />
          ))}
        </div>
      )}

      {/* Add member */}
      <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Add a @geti.education member
        </p>
        <form onSubmit={handleAddSubmit} className="flex gap-2">
          <input
            type="email"
            value={addEmail}
            onChange={(e) => { setAddEmail(e.target.value); setAddError(''); }}
            placeholder="name@geti.education"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={!addEmail.trim() || addMut.isPending || !workspaceId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {addMut.isPending ? 'Adding…' : 'Add'}
          </button>
        </form>
        {addError && <p className="mt-2 text-xs text-rose-600">{addError}</p>}
      </div>
    </div>
  );
}
