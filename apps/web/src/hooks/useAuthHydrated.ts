'use client';

import { useAuthStore } from '@/store/auth.store';

/** True once persisted auth state has been read from localStorage. */
export function useAuthHydrated(): boolean {
  return useAuthStore((s) => s._hasHydrated);
}
