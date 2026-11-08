import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createChunkedAuthStorage } from '../auth/storage-core';
import { createPendingStore } from './pending-core';
const storage =
  Platform.OS === 'web'
    ? {
        async getItem(key: string) {
          return sessionStorage.getItem(key);
        },
        async setItem(key: string, value: string) {
          sessionStorage.setItem(key, value);
        },
        async removeItem(key: string) {
          sessionStorage.removeItem(key);
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
export const pendingStore = createPendingStore(storage);
