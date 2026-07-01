import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserDto } from '@sprintflow/shared';
import type { ProjectMembership } from '@/lib/api/auth';

interface Membership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: string;
  boards: Array<{ id: string; name: string }>;
}

interface AuthUser extends UserDto {
  mustChangePassword?: boolean;
  memberships?: Membership[];
  projectMemberships?: ProjectMembership[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  defaultWorkspaceId: string | null;
  defaultBoardId: string | null;
  /** The workspace the user is currently viewing — persisted across sessions */
  activeWorkspaceId: string | null;
  /** The caller's role in the active workspace */
  activeWorkspaceRole: string | null;
  /** Set after zustand persist finishes reading localStorage */
  _hasHydrated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  setToken: (token: string) => void;
  setActiveWorkspace: (workspaceId: string, role: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      defaultWorkspaceId: null,
      defaultBoardId: null,
      activeWorkspaceId: null,
      activeWorkspaceRole: null,
      _hasHydrated: false,

      setAuth: (accessToken, user) => {
        const first = user.memberships?.[0];
        set({
          accessToken,
          user,
          defaultWorkspaceId: first?.workspaceId ?? null,
          defaultBoardId: first?.boards?.[0]?.id ?? null,
        });
      },

      setToken: (accessToken) => set({ accessToken }),

      setActiveWorkspace: (workspaceId, role) =>
        set({ activeWorkspaceId: workspaceId, activeWorkspaceRole: role }),

      clearAuth: () =>
        set({
          accessToken: null,
          user: null,
          defaultWorkspaceId: null,
          defaultBoardId: null,
          activeWorkspaceId: null,
          activeWorkspaceRole: null,
        }),

      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'sf-auth',
      skipHydration: true,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      partialize: (s) => ({
        accessToken: s.accessToken,
        user: s.user,
        defaultWorkspaceId: s.defaultWorkspaceId,
        defaultBoardId: s.defaultBoardId,
        activeWorkspaceId: s.activeWorkspaceId,
        activeWorkspaceRole: s.activeWorkspaceRole,
      }),
    },
  ),
);
