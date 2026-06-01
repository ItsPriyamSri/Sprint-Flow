import { create } from 'zustand';

export type ConfirmVariant = 'danger' | 'default';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmStore {
  request: ConfirmRequest | null;
  resolver: ((value: boolean) => void) | null;
  show: (request: ConfirmRequest) => Promise<boolean>;
  answer: (value: boolean) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  request: null,
  resolver: null,

  show: (request) =>
    new Promise<boolean>((resolve) => {
      set({ request, resolver: resolve });
    }),

  answer: (value) => {
    get().resolver?.(value);
    set({ request: null, resolver: null });
  },
}));

/** Promise-based confirm — drop-in replacement for window.confirm. */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  return useConfirmStore.getState().show(request);
}
