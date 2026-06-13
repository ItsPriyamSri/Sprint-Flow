'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectStore } from '@/store/project.store';
import { listAdminUsers, setUserLead, setUserStatus, resetUserPassword } from '@/lib/api/admin';

export default function AdminSettingsPage() {
  const { isSuperAdmin } = usePermissions();
  const workspaceId = useAuthStore((s) => s.defaultWorkspaceId);
  const activeProject = useProjectStore((s) => s.activeProject);
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ id: string; msg: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', workspaceId],
    queryFn: () => listAdminUsers(workspaceId ?? undefined),
    enabled: isSuperAdmin && !!workspaceId,
  });

  const statusMut = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: 'ACTIVE' | 'DEACTIVATED' }) =>
      setUserStatus(userId, status),
    onSuccess: (_, { userId, status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setFeedback({ id: userId, msg: `Status set to ${status}` });
      setTimeout(() => setFeedback(null), 3000);
    },
  });

  const leadMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'LEAD' | 'MEMBER' }) =>
      setUserLead(userId, activeProject?.id ?? '', role),
    onSuccess: (_, { userId, role }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setFeedback({ id: userId, msg: `Role set to ${role}` });
      setTimeout(() => setFeedback(null), 3000);
    },
  });

  const resetMut = useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: (_, userId) => {
      setFeedback({ id: userId, msg: 'Password reset to default' });
      setTimeout(() => setFeedback(null), 3000);
    },
  });

  if (!isSuperAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-500">Access denied. Super Admin only.</p>
      </div>
    );
  }

  const users = data?.data ?? [];

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">User Management</h1>
      {activeProject && (
        <p className="mb-4 text-sm text-slate-500">
          Project: <span className="font-medium">{activeProject.name}</span> — lead changes apply to this project.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Loading users...
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Project Role</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const projectMembership = activeProject
                  ? u.projectMemberships.find((pm) => pm.projectId === activeProject.id)
                  : null;
                const msg = feedback?.id === u.id ? feedback.msg : null;

                return (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {u.name}
                      {u.mustChangePassword && (
                        <span className="ml-2 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700">
                          TEMP PW
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          u.role === 'SUPER_ADMIN'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          u.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : u.status === 'DEACTIVATED'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {u.role === 'SUPER_ADMIN' ? '—' : projectMembership?.role ?? 'none'}
                    </td>
                    <td className="px-4 py-3">
                      {u.role !== 'SUPER_ADMIN' && (
                        <div className="flex items-center gap-2">
                          {activeProject && projectMembership?.role !== 'LEAD' && (
                            <button
                              onClick={() => leadMut.mutate({ userId: u.id, role: 'LEAD' })}
                              disabled={leadMut.isPending}
                              className="rounded bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200 disabled:opacity-50"
                            >
                              Make Lead
                            </button>
                          )}
                          {activeProject && projectMembership?.role === 'LEAD' && (
                            <button
                              onClick={() => leadMut.mutate({ userId: u.id, role: 'MEMBER' })}
                              disabled={leadMut.isPending}
                              className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                            >
                              Demote
                            </button>
                          )}
                          {u.status === 'ACTIVE' ? (
                            <button
                              onClick={() => statusMut.mutate({ userId: u.id, status: 'DEACTIVATED' })}
                              disabled={statusMut.isPending}
                              className="rounded bg-rose-100 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-200 disabled:opacity-50"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => statusMut.mutate({ userId: u.id, status: 'ACTIVE' })}
                              disabled={statusMut.isPending}
                              className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            onClick={() => resetMut.mutate(u.id)}
                            disabled={resetMut.isPending}
                            className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-50"
                          >
                            Reset PW
                          </button>
                        </div>
                      )}
                      {msg && <span className="ml-2 text-xs text-green-600">{msg}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
