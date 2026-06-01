import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserDto } from '@sprintflow/shared';

interface Membership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: string;
  boards: Array<{ id: string; name: string }>;
}

interface AuthUser extends UserDto {
  memberships?: Membership[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  defaultWorkspaceId: string | null;
  defaultBoardId: string | null;
  /** Set after zustand persist finishes reading localStorage */
  _hasHydrated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  setToken: (token: string) => void;
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

      clearAuth: () =>
        set({ accessToken: null, user: null, defaultWorkspaceId: null, defaultBoardId: null }),

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
      }),
    },
  ),
);
