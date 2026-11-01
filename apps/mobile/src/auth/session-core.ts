import type { GuestIdentityStorage } from './storage-core';

export interface GuestSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string };
}

interface SessionResult {
  data: { session: GuestSession | null };
  error: unknown;
}

export interface GuestAuthAdapter {
  getSession(): Promise<SessionResult>;
  refreshSession(): Promise<SessionResult>;
  signInAnonymously(): Promise<SessionResult>;
  onAuthStateChange(
    callback: (event: string, session: GuestSession | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
  startAutoRefresh(): unknown;
  stopAutoRefresh(): unknown;
}

export type GuestSessionErrorCode =
  | 'configuration_missing'
  | 'configuration_invalid'
  | 'session_lost'
  | 'unavailable';

const messages: Record<GuestSessionErrorCode, string> = {
  configuration_missing: 'Guest access is not configured yet.',
  configuration_invalid: 'Guest access configuration is unavailable.',
  session_lost: 'Guest access needs to reconnect. Please try again.',
  unavailable: 'Guest access is temporarily unavailable. Please try again.',
};

export class GuestSessionError extends Error {
  constructor(readonly code: GuestSessionErrorCode) {
    super(messages[code]);
    this.name = 'GuestSessionError';
  }
}

export interface GuestSessionState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: { code: GuestSessionErrorCode; message: string } | null;
}

export const idleGuestSession: GuestSessionState = {
  status: 'idle',
  error: null,
};

export function validateGuestConfiguration(
  url: string | undefined,
  publishableKey: string | undefined,
) {
  if (!url || !publishableKey)
    throw new GuestSessionError('configuration_missing');
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
    )
      throw new Error();
    return { url: parsed.origin, publishableKey };
  } catch {
    throw new GuestSessionError('configuration_invalid');
  }
}

export function createGuestSessionManager(
  createAdapter: () => GuestAuthAdapter,
  identities: GuestIdentityStorage,
  now = () => Date.now(),
) {
  let adapter: GuestAuthAdapter | undefined;
  let state = idleGuestSession;
  let inFlight: Promise<GuestSession> | undefined;
  let revision = 0;
  let autoRefresh = false;
  let identity: string | null = null;
  let sessionLost = false;
  const listeners = new Set<() => void>();
  const publish = (next: GuestSessionState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const failure = (error: unknown) =>
    error instanceof GuestSessionError
      ? error
      : new GuestSessionError('unavailable');
  const applyAutoRefresh = () => {
    if (!adapter) return;
    try {
      const operation = autoRefresh
        ? adapter.startAutoRefresh()
        : adapter.stopAutoRefresh();
      // Keep background SDK errors out of UI and unhandled promise reports.
      void Promise.resolve(operation).catch(() => undefined);
    } catch {
      // An explicit ensureSession call still reports any unavailable session.
    }
  };
  const getAdapter = () => {
    if (adapter) return adapter;
    adapter = createAdapter();
    adapter.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        revision += 1;
        sessionLost = true;
        const error = new GuestSessionError('session_lost');
        publish({ status: 'error', error });
      } else if (
        session &&
        session.user?.id === identity &&
        !sessionLost &&
        !inFlight
      ) {
        publish({ status: 'ready', error: null });
      }
    });
    applyAutoRefresh();
    return adapter;
  };
  const ensureSession = (): Promise<GuestSession> => {
    if (inFlight) return inFlight;
    const attempt = revision;
    // Defer adapter calls until inFlight has been assigned, including sync events.
    inFlight = Promise.resolve()
      .then(async () => {
        let remembered: string | null;
        try {
          remembered = await identities.getIdentity();
        } catch (error) {
          throw error instanceof GuestSessionError
            ? error
            : new GuestSessionError('session_lost');
        }
        if ((identity && identity !== remembered) || sessionLost)
          throw new GuestSessionError('session_lost');
        identity = remembered;
        const auth = getAdapter();
        let result = await auth.getSession();
        if (result.error) throw result.error;
        if (attempt !== revision) throw new GuestSessionError('session_lost');
        if (result.data.session) {
          if (identity && result.data.session.user?.id !== identity)
            throw new GuestSessionError('session_lost');
          if (
            !result.data.session.expires_at ||
            result.data.session.expires_at * 1000 <= now() + 60_000
          )
            result = await auth.refreshSession();
        } else {
          if (identity) throw new GuestSessionError('session_lost');
          result = await auth.signInAnonymously();
        }
        if (attempt !== revision) throw new GuestSessionError('session_lost');
        if (
          result.error ||
          !result.data.session?.access_token ||
          !result.data.session.refresh_token ||
          !result.data.session.user?.id
        )
          throw new GuestSessionError('unavailable');
        if (identity && result.data.session.user.id !== identity)
          throw new GuestSessionError('session_lost');
        await identities.rememberIdentity(result.data.session.user.id);
        identity = result.data.session.user.id;
        if (attempt !== revision) throw new GuestSessionError('session_lost');
        publish({ status: 'ready', error: null });
        return result.data.session;
      })
      .catch((error: unknown) => {
        const safeError = failure(error);
        publish({ status: 'error', error: safeError });
        throw safeError;
      })
      .finally(() => {
        inFlight = undefined;
      });
    publish({ status: 'loading', error: null });
    return inFlight;
  };
  return {
    ensureSession,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setAutoRefresh(active: boolean) {
      autoRefresh = active;
      applyAutoRefresh();
    },
  };
}
