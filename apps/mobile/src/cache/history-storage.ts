import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesEncryptAsync,
  aesDecryptAsync,
} from 'expo-crypto';
import {
  createEncryptedHistoryStorage,
  type CacheStorage,
} from './encrypted-storage-core';
const nativeStore = createEncryptedHistoryStorage(
  AsyncStorage,
  {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
  {
    generateKey: async () =>
      (await AESEncryptionKey.generate(AESKeySize.AES256)).encoded('hex'),
    encrypt: async (value, secret, context) => {
      const key = await AESEncryptionKey.import(secret, 'hex');
      const sealed = await aesEncryptAsync(
        new TextEncoder().encode(value),
        key,
        { additionalData: new TextEncoder().encode(context) },
      );
      return sealed.combined('base64');
    },
    decrypt: async (value, secret, context) => {
      const key = await AESEncryptionKey.import(secret, 'hex');
      const bytes = await aesDecryptAsync(
        AESSealedData.fromCombined(value),
        key,
        { additionalData: new TextEncoder().encode(context) },
      );
      return new TextDecoder().decode(bytes);
    },
  },
);
// No plaintext fallback and no history persistence in browser storage.
export const historyStorage: CacheStorage =
  Platform.OS === 'web'
    ? {
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => undefined,
      }
    : nativeStore;
export const historyNamespace = [
  process.env.EXPO_PUBLIC_API_URL,
  process.env.EXPO_PUBLIC_SUPABASE_URL,
]
  .join('|')
  .replace(/[^a-zA-Z0-9._-]/g, '_');
