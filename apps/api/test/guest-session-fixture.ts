import { createClient } from '@supabase/supabase-js';
import { createGuestSessionManager } from '../../mobile/src/auth/session-core';
import {
  createChunkedAuthStorage,
  createGuestIdentityStorage,
  type AuthStorage,
} from '../../mobile/src/auth/storage-core';
export const guestDevelopmentUrl = 'https://dxpiqttvtxjhmlvxstbb.supabase.co';
export async function assertAnonymousAccess(url: string, key: string) {
  if (
    url !== guestDevelopmentUrl ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
  )
    throw new Error(
      'Guest acceptance requires the configured development project and publishable key.',
    );
  const response = await fetch(new URL('/auth/v1/settings', url), {
    headers: { apikey: key },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error('Unable to read public Supabase Auth configuration.');
  const settings = (await response.json()) as {
    external?: { anonymous_users?: boolean };
  };
  if (settings.external?.anonymous_users !== true)
    throw new Error(
      'Supabase Anonymous Sign-Ins are disabled. Enable Anonymous Sign-Ins and Save before running guest acceptance. No model was called.',
    );
}
/** Uses the real mobile session/storage algorithms with a test-owned memory backing store. */
export function guestFixture(
  url: string,
  key: string,
  register: (id: string) => void,
) {
  const values = new Map<string, string>();
  let signups = 0;
  const cleanups: (() => void)[] = [];
  const raw: AuthStorage = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
    removeItem: async (k) => {
      values.delete(k);
    },
  };
  const storage = createChunkedAuthStorage(raw);
  const storageKey = 'guest-acceptance';
  function restart() {
    return createGuestSessionManager(
      () => {
        const client = createClient(url, key, {
          auth: {
            storage,
            storageKey,
            persistSession: true,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            fetch: async (input, init) => {
              const response = await fetch(input, {
                ...init,
                signal: AbortSignal.timeout(12000),
              });
              return response;
            },
          },
        });
        const auth = client.auth;
        return {
          getSession: () => auth.getSession(),
          refreshSession: () => auth.refreshSession(),
          signInAnonymously: async () => {
            signups++;
            const result = await auth.signInAnonymously();
            if (result.data.user) register(result.data.user.id);
            if (result.error)
              throw new Error(
                'Real anonymous session creation failed. Check Anonymous Sign-Ins / CAPTCHA settings.',
              );
            if (result.data.user?.is_anonymous !== true)
              throw new Error('Expected a real anonymous identity');
            return result;
          },
          onAuthStateChange: (callback) => {
            const result = auth.onAuthStateChange(callback);
            cleanups.push(() => result.data.subscription.unsubscribe());
            return result;
          },
          startAutoRefresh: () => auth.startAutoRefresh(),
          stopAutoRefresh: () => auth.stopAutoRefresh(),
        };
      },
      createGuestIdentityStorage(storage, storageKey),
    );
  }
  return {
    restart,
    getSignups: () => signups,
    dispose: () => {
      cleanups.forEach((dispose) => dispose());
      values.clear();
    },
  };
}
