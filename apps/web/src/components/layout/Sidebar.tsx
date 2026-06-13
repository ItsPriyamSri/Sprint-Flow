'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { useProjectStore } from '@/store/project.store';
import { usePermissions } from '@/hooks/usePermissions';
import { SprintCreateModal } from '@/components/scrum/SprintCreateModal';
import { confirmDeleteProject, confirmDeleteSprint } from '@/lib/deleteActions';
import type { WorkspaceInfo } from '@/lib/api/workspaces';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};
export { PRIORITY_COLORS };

interface Props {
  workspace: WorkspaceInfo | null;
}

export function Sidebar({ workspace }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { activeProject, setActiveProject, clearProject } = useProjectStore();
  const { isSuperAdmin, isLead } = usePermissions();
  const isLeadOrAdmin = isSuperAdmin || (activeProject ? isLead(activeProject.id) : false);
  const [sprintsOpen, setSprintsOpen] = useState(true);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [createSprintOpen, setCreateSprintOpen] = useState(false);

  const handleSignOut = () => {
    clearAuth();
    router.push('/login');
  };

  const projects = workspace?.projects ?? [];
  const currentProjectSprints = activeProject?.sprints ?? [];

  const isActive = (href: string) => pathname === href;

  const navLinkCls = (href: string) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive(href)
        ? 'bg-indigo-50 font-medium text-indigo-700'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <aside className="flex w-56 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <Image src="/logo.png" alt="SprintFlow" width={28} height={28} className="flex-shrink-0" priority />
        <span className="font-bold tracking-tight text-slate-900">SprintFlow</span>
      </div>

      {/* Project switcher */}
      {projects.length > 0 && (
        <div className="relative border-b border-slate-200 px-3 py-2.5">
          <button
            onClick={() => setProjectMenuOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
          >
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-700">
              {initials(activeProject?.name ?? 'P')}
            </div>
            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
              {activeProject?.name ?? 'Select project'}
            </span>
            <svg className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {projectMenuOpen && (
            <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProject(p); setProjectMenuOpen(false); router.push('/overview'); }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 ${p.id === activeProject?.id ? 'font-medium text-indigo-700' : 'text-slate-700'}`}
                >
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-indigo-100 text-[9px] font-bold text-indigo-700">
                    {initials(p.name)}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </button>
              ))}
              <div className="mx-2 my-1 border-t border-slate-100" />
              {isSuperAdmin && (
                <Link
                  href="/onboarding"
                  onClick={() => setProjectMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New project
                </Link>
              )}
              {isLeadOrAdmin && (
                <Link
                  href="/import"
                  onClick={() => setProjectMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Import from sheet
                </Link>
              )}
              {activeProject && projects.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    setProjectMenuOpen(false);
                    const remaining = projects.filter((p) => p.id !== activeProject.id);
                    const deleted = await confirmDeleteProject({
                      projectId: activeProject.id,
                      projectName: activeProject.name,
                      queryClient,
                      sprintCount: activeProject.sprints?.length ?? 0,
                      epicCount: activeProject.epics?.length ?? 0,
                    });
                    if (!deleted) return;
                    if (remaining[0]) {
                      setActiveProject(remaining[0]);
                      router.push('/overview');
                    } else {
                      clearProject();
                      router.push('/onboarding');
                    }
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete project
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <Link href="/dashboard" className={navLinkCls('/dashboard')}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
          </svg>
          Dashboard
        </Link>

        <Link href="/overview" className={navLinkCls('/overview')}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 1a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
          </svg>
          Overview
        </Link>

        {/* Sprints expandable */}
        <div>
          <button
            onClick={() => setSprintsOpen((o) => !o)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="flex-1 text-left">Sprints</span>
            <svg
              className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${sprintsOpen ? 'rotate-0' : '-rotate-90'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {sprintsOpen && currentProjectSprints.length > 0 && (
            <div className="ml-6 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
              {currentProjectSprints.map((s) => {
                const href = `/sprints/${s.id}`;
                return (
                  <div
                    key={s.id}
                    className={`group/sprint flex items-center gap-0.5 rounded-md pr-1 ${
                      isActive(href) ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <Link
                      href={href}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-xs transition-colors ${
                        isActive(href) ? 'font-medium text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          s.status === 'ACTIVE' ? 'bg-green-500' : s.status === 'COMPLETED' ? 'bg-slate-300' : 'bg-amber-400'
                        }`}
                      />
                      <span className="truncate">{s.name}</span>
                      {s.releaseMilestone && (
                        <span className="ml-auto flex-shrink-0 rounded bg-indigo-100 px-1 text-[9px] font-bold text-indigo-600">R</span>
                      )}
                    </Link>
                    <button
                      type="button"
                      title={`Delete ${s.name}`}
                      onClick={async (e) => {
                        e.preventDefault();
                        const deleted = await confirmDeleteSprint({
                          sprintId: s.id,
                          sprintName: s.name,
                          workspaceId: workspace?.id ?? '',
                          projectId: activeProject?.id,
                          queryClient,
                          onDeleted: () => {
                            if (isActive(href)) router.push('/overview');
                          },
                        });
                        if (deleted && isActive(href)) router.push('/overview');
                      }}
                      className="rounded p-0.5 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover/sprint:opacity-100 transition-all"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {sprintsOpen && currentProjectSprints.length === 0 && (
            <p className="ml-9 mt-1 text-xs text-slate-400">No sprints yet</p>
          )}

          {sprintsOpen && activeProject && (
            <button
              onClick={() => setCreateSprintOpen(true)}
              className="ml-6 mt-1.5 flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50/50 hover:text-indigo-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Sprint
            </button>
          )}
        </div>

        <Link href="/epics" className={navLinkCls('/epics')}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
          </svg>
          Epics
        </Link>

        <Link href="/my-work" className={navLinkCls('/my-work')}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          My Work
        </Link>

        <Link href="/backlog" className={navLinkCls('/backlog')}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Backlog
        </Link>

        <Link href="/team" className={navLinkCls('/team')}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Team
        </Link>

        <Link href="/activity" className={navLinkCls('/activity')}>
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Activity
        </Link>

        <div className="my-2 mx-2 border-t border-slate-100" />

        <Link href="/board"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive('/board') ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          Flow view
        </Link>

        {isLeadOrAdmin && (
          <Link href="/import" className={navLinkCls('/import')}>
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Import from sheet
          </Link>
        )}

        {isSuperAdmin && (
          <Link href="/settings/admin" className={navLinkCls('/settings/admin')}>
            <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin Settings
          </Link>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-200 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
            {initials(user?.name ?? 'U')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-800">{user?.name}</p>
            {user?.email && <p className="truncate text-[10px] text-slate-400">{user.email}</p>}
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
      <SprintCreateModal
        isOpen={createSprintOpen}
        onClose={() => setCreateSprintOpen(false)}
        workspaceId={workspace?.id ?? ''}
        projectId={activeProject?.id ?? ''}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['workspace'] });
        }}
      />
    </aside>
  );
}
