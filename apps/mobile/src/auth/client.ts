import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  createGuestSessionManager,
  validateGuestConfiguration,
} from './session-core';
import {
  createChunkedAuthStorage,
  createGuestIdentityStorage,
  type AuthStorage,
} from './storage-core';

const storage: AuthStorage =
  Platform.OS === 'web'
    ? {
        async getItem(key) {
          return globalThis.sessionStorage.getItem(`companion.guest.${key}`);
        },
        async setItem(key, value) {
          globalThis.sessionStorage.setItem(`companion.guest.${key}`, value);
        },
        async removeItem(key) {
          globalThis.sessionStorage.removeItem(`companion.guest.${key}`);
        },
      }
    : createChunkedAuthStorage({
        getItem: (key) => SecureStore.getItemAsync(key),
        setItem: (key, value) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          }),
        removeItem: (key) => SecureStore.deleteItemAsync(key),
      });

const configuration = () => {
  const config = validateGuestConfiguration(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return {
    ...config,
    storageKey: `guest-${new URL(config.url).hostname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  };
};

export const guestSessionManager = createGuestSessionManager(
  () => {
    const config = configuration();
    const client = createClient(config.url, config.publishableKey, {
      auth: {
        storage,
        storageKey: config.storageKey,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        debug: false,
      },
    });
    return client.auth;
  },
  {
    getIdentity: () =>
      createGuestIdentityStorage(
        storage,
        configuration().storageKey,
      ).getIdentity(),
    rememberIdentity: (userId) =>
      createGuestIdentityStorage(
        storage,
        configuration().storageKey,
      ).rememberIdentity(userId),
  },
);

export const ensureGuestSession = guestSessionManager.ensureSession;

export async function getGuestAccessToken(): Promise<string> {
  return (await ensureGuestSession()).access_token;
}
