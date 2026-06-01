import { create } from 'zustand';

export type BoardView = 'board' | 'sprint' | 'backlog' | 'owner';

interface BoardStore {
  // Task detail drawer
  activeTaskId: string | null;
  openTask: (id: string) => void;
  closeTask: () => void;

  // Active view
  activeView: BoardView;
  setView: (view: BoardView) => void;

  // Filters — values are IDs (sprintId, userId, epicId) or enum strings
  filters: { sprint?: string; owner?: string; epic?: string; priority?: string };
  setFilter: (key: string, value: string | undefined) => void;
  clearFilters: () => void;
}

export const useBoardStore = create<BoardStore>((set) => ({
  activeTaskId: null,
  openTask: (id) => set({ activeTaskId: id }),
  closeTask: () => set({ activeTaskId: null }),

  activeView: 'board',
  setView: (view) => set({ activeView: view }),

  filters: {},
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: {} }),
}));
