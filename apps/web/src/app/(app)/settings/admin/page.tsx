'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
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
  const isPending = user.status === 'UNCLAIMED';

  return (
    <div className={`rounded-xl border bg-white px-4 py-3 transition-colors ${isDeactivated ? 'border-slate-100 opacity-60' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${isSa ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'}`}>
          {(user.email ?? 'U').charAt(0).toUpperCase()}
        </div>

        {/* Email + names */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900 text-sm break-all">{user.email}</span>
            {isSa && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-700">
                SUPER ADMIN
              </span>
            )}
            {isPending && !isSa && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">
                NOT YET SIGNED IN
              </span>
            )}
            {isDeactivated && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700">
                DEACTIVATED
              </span>
            )}
          </div>

          {/* Linked names row */}
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
                  >
                    ×
                  </button>
                </span>
              ))}
              <LinkDropdown
                userId={user.id}
                unlinkedNames={unlinkedNames}
                onLink={(nameUserId) => onLink(user.id, nameUserId)}
              />
            </div>
          )}

          {feedback && (
            <p className="mt-1 text-xs text-green-600">{feedback}</p>
          )}
        </div>

        {/* Project role */}
        {!isSa && (
          <div className="hidden flex-shrink-0 sm:flex flex-col items-center gap-0.5 min-w-[56px]">
            <span className="text-[10px] text-slate-400">Project Role</span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                isLead
                  ? 'bg-indigo-100 text-indigo-700'
                  : pm
                  ? 'bg-slate-100 text-slate-600'
                  : 'text-slate-400'
              }`}
            >
              {isLead ? 'LEAD' : pm?.role ?? 'none'}
            </span>
          </div>
        )}

        {/* Actions */}
        {!isSa && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
            {activeProjectId && (
              <button
                onClick={() => onLead(user.id, isLead ? 'MEMBER' : 'LEAD')}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  isLead
                    ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                }`}
              >
                {isLead ? 'Demote' : 'Make Lead'}
              </button>
            )}
            <button
              onClick={() => onStatus(user.id, isDeactivated ? 'ACTIVE' : 'DEACTIVATED')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                isDeactivated
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
              }`}
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

export default function AdminSettingsPage() {
  const { isSuperAdmin } = usePermissions();
  const workspaceId = useAuthStore((s) => s.defaultWorkspaceId);
  const activeProject = useProjectStore((s) => s.activeProject);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  function flash(id: string, msg: string) {
    setFeedback((prev) => ({ ...prev, [id]: msg }));
    setTimeout(() => setFeedback((prev) => { const n = { ...prev }; delete n[id]; return n; }), 3000);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', workspaceId],
    queryFn: () => listAdminUsers(workspaceId ?? undefined),
    enabled: isSuperAdmin && !!workspaceId,
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
    mutationFn: () => addEmailUser(addEmail.trim().toLowerCase(), workspaceId ?? ''),
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
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">User Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          {activeProject
            ? <>Lead role applies to <span className="font-medium text-slate-700">{activeProject.name}</span>. Switch projects in the sidebar to manage a different project.</>
            : 'Select a project in the sidebar to manage Lead roles.'}
        </p>
      </div>

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
              {search ? 'No users match that email.' : 'No users yet.'}
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
          Add a @geti.education email
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
        {addError && (
          <p className="mt-2 text-xs text-rose-600">{addError}</p>
        )}
      </div>
    </div>
  );
}
