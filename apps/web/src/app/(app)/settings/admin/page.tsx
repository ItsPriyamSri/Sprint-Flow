'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectStore } from '@/store/project.store';
import {
  listAdminUsers,
  setUserLead,
  setUserStatus,
  resetUserPassword,
  addEmailUser,
  linkName,
  unlinkName,
  type AdminUser,
  type LinkedName,
} from '@/lib/api/admin';
import {
  listAllTeams,
  createTeam,
  type TeamInfo,
} from '@/lib/api/teams';

function LinkDropdown({
  userId,
  unlinkedNames,
  onLink,
}: {
  userId: string;
  unlinkedNames: LinkedName[];
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
        + name
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

function UserRow({
  user,
  unlinkedNames,
  activeProjectId,
  onLead,
  onStatus,
  onReset,
  onLink,
  onUnlink,
  feedback,
}: {
  user: AdminUser;
  unlinkedNames: LinkedName[];
  activeProjectId: string | undefined;
  onLead: (userId: string, role: 'LEAD' | 'MEMBER') => void;
  onStatus: (userId: string, status: 'ACTIVE' | 'DEACTIVATED') => void;
  onReset: (userId: string) => void;
  onLink: (userId: string, nameUserId: string) => void;
  onUnlink: (userId: string, nameId: string) => void;
  feedback: string | null;
}) {
  const pm = activeProjectId
    ? user.projectMemberships.find((m) => m.projectId === activeProjectId)
    : null;
  const isLead = pm?.role === 'LEAD';
  const isSa = user.role === 'SUPER_ADMIN';
  const isDeactivated = user.status === 'DEACTIVATED';
  const isPending = user.mustChangePassword && !isDeactivated && !isSa;

  return (
    <div className={`rounded-xl border bg-white px-4 py-3 transition-colors ${isDeactivated ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isSa ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {(user.email ?? 'U').charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 text-sm break-all">{user.email}</span>
            {isSa && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700">SUPER ADMIN</span>
            )}
            {isPending && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">TEMP PW</span>
            )}
            {isDeactivated && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700">DEACTIVATED</span>
            )}
          </div>

          {!isSa && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {user.linkedNames.map((n) => (
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
          )}

          {feedback && <p className="mt-1 text-xs text-green-600">{feedback}</p>}
        </div>

        {!isSa && (
          <div className="hidden flex-shrink-0 sm:flex flex-col items-center gap-0.5 min-w-[56px]">
            <span className="text-[10px] text-slate-400">Project Role</span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${isLead ? 'bg-indigo-100 text-indigo-700' : pm ? 'bg-slate-100 text-slate-600' : 'text-slate-400'}`}>
              {isLead ? 'LEAD' : pm?.role ?? 'none'}
            </span>
          </div>
        )}

        {!isSa && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
            {activeProjectId && (
              <button
                onClick={() => onLead(user.id, isLead ? 'MEMBER' : 'LEAD')}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${isLead ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
              >
                {isLead ? 'Demote' : 'Make Lead'}
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
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTeamPanel({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [error, setError] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      createTeam({ name: name.trim(), slug: slug.trim(), description: desc.trim() || undefined, leadEmail: leadEmail.trim() || undefined }),
    onSuccess: () => {
      setOpen(false);
      setName(''); setSlug(''); setDesc(''); setLeadEmail('');
      onCreated();
    },
    onError: (e: Error) => setError(e.message ?? 'Failed to create team'),
  });

  // Auto-generate slug from name
  useEffect(() => {
    setSlug(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }, [name]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
      >
        + Create Team
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-500">New Team</p>
      <div className="flex flex-col gap-2.5">
        <input
          type="text"
          placeholder="Team name (e.g. R&D Team)"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <input
          type="text"
          placeholder="Slug (e.g. rnd-team)"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <input
          type="email"
          placeholder="Team lead email (optional)"
          value={leadEmail}
          onChange={(e) => { setLeadEmail(e.target.value); setError(''); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2 self-end">
          <button
            onClick={() => { setOpen(false); setError(''); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!name.trim() || !slug.trim() || mut.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {mut.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { isSuperAdmin } = usePermissions();
  const activeProject = useProjectStore((s) => s.activeProject);
  const queryClient = useQueryClient();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  function flash(id: string, msg: string) {
    setFeedback((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => setFeedback((prev) => { const n = { ...prev }; delete n[id]; return n; }), 3000);
  }

  const { data: teams } = useQuery({
    queryKey: ['all-teams'],
    queryFn: listAllTeams,
    enabled: isSuperAdmin,
    staleTime: 60_000,
  });

  // Auto-select first team once loaded
  useEffect(() => {
    if (teams && teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0]!.id);
    }
  }, [teams, selectedTeamId]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', selectedTeamId],
    queryFn: () => listAdminUsers(selectedTeamId ?? undefined),
    enabled: isSuperAdmin && !!selectedTeamId,
  });

  const leadMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'LEAD' | 'MEMBER' }) =>
      setUserLead(userId, activeProject?.id ?? '', role),
    onSuccess: (_, { userId, role }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      flash(userId, role === 'LEAD' ? 'Promoted to Lead' : 'Demoted to Member');
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'ACTIVE' | 'DEACTIVATED' }) =>
      setUserStatus(userId, status),
    onSuccess: (_, { userId, status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      flash(userId, status === 'DEACTIVATED' ? 'Account deactivated' : 'Account activated');
    },
  });

  const resetMut = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: (_, userId) => flash(userId, 'Password reset to default'),
  });

  const addMut = useMutation({
    mutationFn: () => addEmailUser(addEmail.trim().toLowerCase(), selectedTeamId ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setAddEmail('');
      setAddError('');
    },
    onError: (e: Error) => setAddError(e.message ?? 'Failed to add user'),
  });

  const linkMut = useMutation({
    mutationFn: ({ userId, nameUserId }: { userId: string; nameUserId: string }) =>
      linkName(userId, nameUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const unlinkMut = useMutation({
    mutationFn: ({ userId, nameId }: { userId: string; nameId: string }) =>
      unlinkName(userId, nameId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-500">Access denied. Super Admin only.</p>
      </div>
    );
  }

  const users = data?.data ?? [];
  const unlinkedNames = data?.unlinkedNames ?? [];

  const filtered = search
    ? users.filter((u) => (u.email ?? '').toLowerCase().includes(search.toLowerCase()))
    : users;

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail.trim() || !selectedTeamId) return;
    if (!addEmail.trim().endsWith('@geti.education')) {
      setAddError('Only @geti.education emails are allowed');
      return;
    }
    addMut.mutate();
  };

  const selectedTeam = teams?.find((t) => t.id === selectedTeamId);

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Admin Console</h1>
          <p className="mt-1 text-sm text-slate-500">
            {activeProject
              ? <>Lead role applies to <span className="font-medium text-slate-700">{activeProject.name}</span>.</>
              : 'Select a project in the sidebar to manage Lead roles.'}
          </p>
        </div>
      </div>

      {/* Team selector + Create Team */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(teams ?? []).map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTeamId(t.id)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              t.id === selectedTeamId
                ? 'bg-violet-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.name}
            <span className={`ml-1.5 text-xs ${t.id === selectedTeamId ? 'text-violet-200' : 'text-slate-400'}`}>
              {t.memberCount}
            </span>
          </button>
        ))}
        <CreateTeamPanel
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['all-teams'] });
            queryClient.invalidateQueries({ queryKey: ['teams'] });
          }}
        />
      </div>

      {selectedTeam && (
        <p className="mb-3 text-xs text-slate-400">
          Showing members of <span className="font-medium text-slate-600">{selectedTeam.name}</span>
          {selectedTeam.leads.length > 0 && (
            <> — lead: {selectedTeam.leads.map((l) => l.email ?? l.name).join(', ')}</>
          )}
        </p>
      )}

      {/* Search */}
      <div className="mb-3 relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* User list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Loading users...
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
              {search ? 'No users match that email.' : 'No users in this team yet.'}
            </div>
          )}
          {filtered.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              unlinkedNames={unlinkedNames}
              activeProjectId={activeProject?.id}
              onLead={(userId, role) => leadMut.mutate({ userId, role })}
              onStatus={(userId, status) => statusMut.mutate({ userId, status })}
              onReset={(userId) => resetMut.mutate(userId)}
              onLink={(userId, nameUserId) => linkMut.mutate({ userId, nameUserId })}
              onUnlink={(userId, nameId) => unlinkMut.mutate({ userId, nameId })}
              feedback={feedback[u.id] ?? null}
            />
          ))}
        </div>
      )}

      {/* Add email */}
      <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Add a @geti.education member to {selectedTeam?.name ?? 'selected team'}
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
            disabled={!addEmail.trim() || addMut.isPending || !selectedTeamId}
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
