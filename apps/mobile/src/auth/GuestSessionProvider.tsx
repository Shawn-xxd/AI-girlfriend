import {
  createContext,
  useContext,
  useEffect,
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
  useEffect(() => {
    if (!enabled) return;
    guestSessionManager.setAutoRefresh(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (next) => {
      guestSessionManager.setAutoRefresh(next === 'active');
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
        ...(enabled ? state : idleGuestSession),
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
