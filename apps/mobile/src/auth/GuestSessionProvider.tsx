import { useQueryClient } from '@tanstack/react-query';
import { connectHistoryCache } from '../cache/history-core';
import { historyStorage, historyNamespace } from '../cache/history-storage';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { ensureGuestSession, guestSessionManager } from './client';
import { idleGuestSession, type GuestSessionState } from './session-core';

interface GuestSessionContextValue extends GuestSessionState {
  retry(): Promise<void>;
}

const GuestSessionContext = createContext<GuestSessionContextValue>({
  ...idleGuestSession,
  retry: async () => undefined,
});

export function GuestSessionProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(
    guestSessionManager.subscribe,
    guestSessionManager.getSnapshot,
    () => idleGuestSession,
  );
  const cache = useQueryClient();
  const [restoredOwner, setRestoredOwner] = useState<string>();
  const history = useRef<ReturnType<typeof connectHistoryCache> | null>(null);
  const owner = enabled && state.status === 'ready' ? state.owner : undefined;
  useEffect(() => {
    if (!owner) {
      setRestoredOwner(undefined);
      return;
    }
    let current = true;
    const connection = connectHistoryCache(
      cache,
      historyStorage,
      historyNamespace,
      owner,
      () =>
        current &&
        guestSessionManager.getSnapshot().status === 'ready' &&
        guestSessionManager.getSnapshot().owner === owner,
    );
    history.current = connection;
    // Cache failure or slow storage must never block session restoration indefinitely.
    const timeout = setTimeout(() => {
      if (current) setRestoredOwner(owner);
    }, 1000);
    void connection.ready
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timeout);
        if (current) setRestoredOwner(owner);
      });
    return () => {
      current = false;
      clearTimeout(timeout);
      history.current = null;
      const latest = guestSessionManager.getSnapshot();
      void connection.stop(latest.error?.code === 'session_lost');
    };
  }, [cache, owner]);
  const displayState =
    state.status === 'ready' && restoredOwner !== state.owner
      ? { status: 'loading' as const, error: null }
      : state;
  useEffect(() => {
    if (!enabled) return;
    guestSessionManager.setAutoRefresh(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (next) => {
      guestSessionManager.setAutoRefresh(next === 'active');
      if (next !== 'active')
        void history.current?.flush().catch(() => undefined);
    });
    void ensureGuestSession().catch(() => undefined);
    return () => {
      subscription.remove();
      guestSessionManager.setAutoRefresh(false);
    };
  }, [enabled]);
  return (
    <GuestSessionContext.Provider
      value={{
        ...(enabled ? displayState : idleGuestSession),
        retry: async () => {
          if (enabled) await ensureGuestSession();
        },
      }}
    >
      {children}
    </GuestSessionContext.Provider>
  );
}

export function useGuestSession() {
  return useContext(GuestSessionContext);
}
