import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ProjectDto } from '@/lib/api/projects';

interface ProjectStore {
  activeProjectId: string | null;
  activeProject: ProjectDto | null;
  setActiveProject: (project: ProjectDto) => void;
  setActiveProjectId: (id: string) => void;
  clearProject: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeProject: null,

      setActiveProject: (project) =>
        set({ activeProjectId: project.id, activeProject: project }),

      setActiveProjectId: (id) =>
        set({ activeProjectId: id }),

      clearProject: () =>
        set({ activeProjectId: null, activeProject: null }),
    }),
    {
      name: 'sf-project',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      partialize: (s) => ({ activeProjectId: s.activeProjectId }),
    },
  ),
);
