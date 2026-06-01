'use client';

import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wireApiClient } from '@/lib/api/client';
import { getMe } from '@/lib/api/auth';
import { useAuthStore } from '@/store/auth.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

function ApiClientWirer() {
  const getToken = () => useAuthStore.getState().accessToken;
  const clearAuth = useAuthStore.getState().clearAuth;

  useEffect(() => {
    wireApiClient(getToken, clearAuth);

    // Listen for token refresh events from the API client
    const handler = (e: Event) => {
      const token = (e as CustomEvent<string>).detail;
      useAuthStore.getState().setToken(token);
    };
    window.addEventListener('sf:token-refreshed', handler);
    return () => window.removeEventListener('sf:token-refreshed', handler);
  }, []);

  return null;
}

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001/api/v1';

/** Load auth from localStorage once on the client (avoids SSR/hydration races). */
function AuthPersistence() {
  useEffect(() => {
    const finish = () => useAuthStore.setState({ _hasHydrated: true });

    const unsub = useAuthStore.persist.onFinishHydration(finish);
    void Promise.resolve(useAuthStore.persist.rehydrate()).finally(finish);

    return unsub;
  }, []);

  return null;
}

function AuthHydrator() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const defaultWorkspaceId = useAuthStore((s) => s.defaultWorkspaceId);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!hasHydrated || !accessToken) return;

    // Renew access token from httpOnly refresh cookie when the stored JWT expired
    fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { accessToken?: string } | null) => {
        if (data?.accessToken) useAuthStore.getState().setToken(data.accessToken);
      })
      .catch(() => {});

    if (defaultWorkspaceId || hydratedRef.current) return;
    hydratedRef.current = true;

    getMe()
      .then((user) => {
        const token = useAuthStore.getState().accessToken;
        if (token) useAuthStore.getState().setAuth(token, user);
      })
      .catch(() => {
        hydratedRef.current = false;
      });
  }, [hasHydrated, accessToken, defaultWorkspaceId]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientWirer />
      <AuthPersistence />
      <AuthHydrator />
      <ConfirmDialog />
      {children}
    </QueryClientProvider>
  );
}
