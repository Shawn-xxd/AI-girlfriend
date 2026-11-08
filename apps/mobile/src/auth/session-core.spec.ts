import { describe, expect, it, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import { createGuestIdentityStorage, type AuthStorage } from './storage-core';
import {
  createGuestSessionManager,
  GuestSessionError,
  validateGuestConfiguration,
  type GuestAuthAdapter,
  type GuestSession,
} from './session-core';

const session: GuestSession = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_at: 3600,
  user: { id: '11111111-1111-4111-8111-111111111111' },
};
const result = (value: GuestSession | null, error: unknown = null) => ({
  data: { session: value },
  error,
});

function memoryStorage() {
  const items = new Map<string, string>();
  const storage: AuthStorage = {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    },
  };
  return { items, storage };
}

function setup(existing: GuestSession | null = null) {
  let callback: (event: string, value: GuestSession | null) => void = () =>
    undefined;
  const adapter: GuestAuthAdapter = {
    getSession: jest.fn(async () => result(existing)),
    refreshSession: jest.fn(async () => result(session)),
    signInAnonymously: jest.fn(async () => result(session)),
    onAuthStateChange: jest.fn(
      (listener: (event: string, value: GuestSession | null) => void) => {
        callback = listener;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    ),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  };
  const create = jest.fn(() => adapter);
  const { items, storage } = memoryStorage();
  const identities = createGuestIdentityStorage(storage, 'test-auth');
  const manager = createGuestSessionManager(create, identities, () => 0);
  return {
    adapter,
    create,
    manager,
    identities,
    items,
    emit: (event: string, value: GuestSession | null) => callback(event, value),
  };
}

describe('guest sessions', () => {
  it('stays lazy and deduplicates concurrent initialization', async () => {
    const { manager, adapter, create } = setup();
    expect(create).not.toHaveBeenCalled();
    const first = manager.ensureSession();
    const second = manager.ensureSession();
    expect(second).toBe(first);
    await expect(first).resolves.toBe(session);
    expect(adapter.getSession).toHaveBeenCalledTimes(1);
    expect(adapter.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().status).toBe('ready');
  });

  it('reuses a saved session without creating another anonymous user', async () => {
    const { manager, adapter } = setup(session);
    await expect(manager.ensureSession()).resolves.toBe(session);
    expect(adapter.signInAnonymously).not.toHaveBeenCalled();
    expect(adapter.refreshSession).not.toHaveBeenCalled();
  });

  it('keeps ready access stable while API calls read the saved token', async () => {
    const { manager, adapter } = setup(session);
    await manager.ensureSession();
    const phases: string[] = [];
    const unsubscribe = manager.subscribe(() =>
      phases.push(manager.getSnapshot().status),
    );
    for (let i = 0; i < 3; i++) await manager.ensureSession();
    unsubscribe();
    expect(phases).not.toContain('loading');
    expect(manager.getSnapshot().status).toBe('ready');
    expect(adapter.signInAnonymously).not.toHaveBeenCalled();
  });

  it('deduplicates reentry from a synchronous state subscriber', async () => {
    const { manager, adapter } = setup();
    let reentered: Promise<GuestSession> | undefined;
    const unsubscribe = manager.subscribe(() => {
      if (manager.getSnapshot().status === 'loading')
        reentered = manager.ensureSession();
    });
    const pending = manager.ensureSession();
    expect(reentered).toBe(pending);
    await pending;
    unsubscribe();
    expect(adapter.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expiring session and never replaces it after refresh failure', async () => {
    const { manager, adapter } = setup({ ...session, expires_at: 5 });
    jest
      .mocked(adapter.refreshSession)
      .mockResolvedValueOnce(
        result(null, new Error('private-token-or-upstream-detail')),
      );
    await expect(manager.ensureSession()).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(JSON.stringify(manager.getSnapshot())).not.toContain('private');
    expect(adapter.signInAnonymously).not.toHaveBeenCalled();
    await expect(manager.ensureSession()).resolves.toBe(session);
    expect(adapter.refreshSession).toHaveBeenCalledTimes(2);
  });

  it('does not replace a saved identity when storage or getSession fails', async () => {
    const { manager, adapter } = setup();
    jest
      .mocked(adapter.getSession)
      .mockRejectedValueOnce(new Error('sensitive-storage-detail'));
    await expect(manager.ensureSession()).rejects.toBeInstanceOf(
      GuestSessionError,
    );
    expect(adapter.signInAnonymously).not.toHaveBeenCalled();
  });

  it('reports anonymous sign-in errors safely and permits an explicit retry', async () => {
    const { manager, adapter, identities } = setup();
    jest.mocked(adapter.signInAnonymously).mockResolvedValueOnce(
      result(null, {
        code: 'anonymous_provider_disabled',
        message: 'private',
      }),
    );
    await expect(manager.ensureSession()).rejects.toThrow(
      'Guest access is temporarily unavailable. Please try again.',
    );
    expect(manager.getSnapshot().status).toBe('error');
    await expect(identities.getIdentity()).resolves.toBeNull();
    await expect(manager.ensureSession()).resolves.toBe(session);
    await expect(identities.getIdentity()).resolves.toBe(session.user.id);
  });

  it('does not publish a stale sign-in result after sign-out', async () => {
    const { manager, adapter, emit } = setup();
    let finish!: (value: ReturnType<typeof result>) => void;
    jest
      .mocked(adapter.signInAnonymously)
      .mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const pending = manager.ensureSession();
    await new Promise<void>((resolve) => setImmediate(resolve));
    emit('SIGNED_OUT', null);
    emit('SIGNED_IN', session);
    finish(result(session));
    await expect(pending).rejects.toMatchObject({ code: 'session_lost' });
    expect(manager.getSnapshot().status).toBe('error');
  });

  it('does not construct a client when public configuration is missing', async () => {
    const createClient = jest.fn<() => GuestAuthAdapter>();
    const { identities } = setup();
    const manager = createGuestSessionManager(() => {
      validateGuestConfiguration(undefined, undefined);
      return createClient();
    }, identities);
    await expect(manager.ensureSession()).rejects.toMatchObject({
      code: 'configuration_missing',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('rejects secret keys, legacy JWTs and credential-bearing URLs', () => {
    for (const key of ['sb_secret_private', 'eyJhbGciOiJIUzI1NiJ9.fake'])
      expect(() =>
        validateGuestConfiguration('https://example.supabase.co', key),
      ).toThrow(GuestSessionError);
    expect(() =>
      validateGuestConfiguration(
        'https://user:password@example.supabase.co',
        'sb_publishable_test',
      ),
    ).toThrow(GuestSessionError);
    expect(
      validateGuestConfiguration(
        'https://example.supabase.co',
        'sb_publishable_test',
      ).url,
    ).toBe('https://example.supabase.co');
  });

  it('starts refresh only after activation and stops it in the background', async () => {
    const { manager, adapter, create } = setup(session);
    manager.setAutoRefresh(true);
    expect(create).not.toHaveBeenCalled();
    await manager.ensureSession();
    expect(adapter.startAutoRefresh).toHaveBeenCalledTimes(1);
    manager.setAutoRefresh(false);
    expect(adapter.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it('never reconnects as another identity after SIGNED_OUT, including a restart', async () => {
    const { manager, adapter, identities, emit } = setup();
    await manager.ensureSession();
    emit('SIGNED_OUT', null);
    emit('SIGNED_IN', session);
    expect(manager.getSnapshot().status).toBe('error');
    await expect(manager.ensureSession()).rejects.toMatchObject({
      code: 'session_lost',
    });
    jest.mocked(adapter.getSession).mockResolvedValue(result(null));
    const restarted = createGuestSessionManager(() => adapter, identities);
    await expect(restarted.ensureSession()).rejects.toMatchObject({
      code: 'session_lost',
    });
    expect(adapter.signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('rejects a saved session belonging to a different remembered guest', async () => {
    const { manager, adapter, identities } = setup(session);
    await identities.rememberIdentity('22222222-2222-4222-8222-222222222222');
    await expect(manager.ensureSession()).rejects.toMatchObject({
      code: 'session_lost',
    });
    expect(adapter.refreshSession).not.toHaveBeenCalled();
    expect(adapter.signInAnonymously).not.toHaveBeenCalled();
  });

  it('does not initialize auth or sign up when the identity marker is corrupt', async () => {
    const { manager, create, items } = setup();
    items.set('test-auth-identity', 'corrupt');
    await expect(manager.ensureSession()).rejects.toMatchObject({
      code: 'session_lost',
    });
    expect(create).not.toHaveBeenCalled();
  });
});

describe('guest identity with the real Supabase SDK and stubbed fetch', () => {
  const storageKey = 'guest-example.supabase.co';
  const futureSession = () => ({
    ...session,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  const rejectedRefresh = () =>
    new Response(
      JSON.stringify({
        code: 'refresh_token_not_found',
        message: 'upstream-detail-not-for-ui',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'X-Supabase-Api-Version': '2024-01-01',
        },
      },
    );
  function sdkSetup(existing: GuestSession | null = null) {
    const { items, storage } = memoryStorage();
    if (existing) items.set(storageKey, JSON.stringify(existing));
    const requests: string[] = [];
    const fetch = jest.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(String(input)).pathname;
      requests.push(pathname);
      if (pathname === '/auth/v1/token') return rejectedRefresh();
      if (pathname === '/auth/v1/signup')
        return new Response(
          JSON.stringify({
            ...futureSession(),
            expires_in: 3600,
            token_type: 'bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      throw new Error('Unexpected stubbed auth request');
    });
    let client: ReturnType<typeof createClient> | undefined;
    const create = jest.fn(() => {
      client = createClient(
        'https://example.supabase.co',
        'sb_publishable_test',
        {
          global: { fetch },
          auth: {
            storage,
            storageKey,
            persistSession: true,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            debug: false,
          },
        },
      );
      return client.auth;
    });
    const identities = createGuestIdentityStorage(storage, storageKey);
    return {
      items,
      requests,
      identities,
      create,
      manager: createGuestSessionManager(create, identities),
      dispose: async () => client?.auth.dispose(),
    };
  }

  it('marks only a completed real anonymous sign-in and reuses it after restart', async () => {
    const { manager, identities, requests, create, dispose } = sdkSetup();
    try {
      expect(await identities.getIdentity()).toBeNull();
      await expect(manager.ensureSession()).resolves.toMatchObject({
        user: session.user,
      });
      expect(await identities.getIdentity()).toBe(session.user.id);
      await dispose();
      const restarted = createGuestSessionManager(create, identities);
      await expect(restarted.ensureSession()).resolves.toMatchObject({
        user: session.user,
      });
      expect(requests).toEqual(['/auth/v1/signup']);
    } finally {
      await dispose();
    }
  });

  it('retains identity when getSession automatically refreshes and deletes a rejected session', async () => {
    const { manager, items, requests, identities, create, dispose } =
      sdkSetup(futureSession());
    // The SDK may log upstream errors even with debug:false; UI redaction is
    // asserted separately below rather than assuming all SDK logging is off.
    const sdkLog = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await manager.ensureSession();
      items.set(storageKey, JSON.stringify({ ...session, expires_at: 1 }));
      const first = manager.ensureSession();
      expect(manager.ensureSession()).toBe(first);
      await expect(first).rejects.toBeInstanceOf(GuestSessionError);
      expect(items.has(storageKey)).toBe(false);
      expect(await identities.getIdentity()).toBe(session.user.id);
      expect(JSON.stringify(manager.getSnapshot())).not.toContain(
        'upstream-detail',
      );
      await expect(manager.ensureSession()).rejects.toMatchObject({
        code: 'session_lost',
      });
      await dispose();
      const restarted = createGuestSessionManager(create, identities);
      await expect(restarted.ensureSession()).rejects.toMatchObject({
        code: 'session_lost',
      });
      expect(requests).toEqual(['/auth/v1/token']);
    } finally {
      sdkLog.mockRestore();
      await dispose();
    }
  });

  it('migrates an already expired stored identity before constructing the SDK', async () => {
    const { manager, requests, identities, dispose } = sdkSetup({
      ...session,
      expires_at: 1,
    });
    const sdkLog = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await expect(manager.ensureSession()).rejects.toBeInstanceOf(
        GuestSessionError,
      );
      expect(await identities.getIdentity()).toBe(session.user.id);
      await expect(manager.ensureSession()).rejects.toMatchObject({
        code: 'session_lost',
      });
      expect(requests).toEqual(['/auth/v1/token']);
    } finally {
      sdkLog.mockRestore();
      await dispose();
    }
  });
});
