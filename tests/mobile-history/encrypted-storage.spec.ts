import { expect, it } from '@jest/globals';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import {
  createEncryptedHistoryStorage,
  type HistoryCipher,
} from '../../apps/mobile/src/cache/encrypted-storage-core';
function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (k: string) => values.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: async (k: string) => {
      values.delete(k);
    },
  };
}
const cipher: HistoryCipher = {
  generateKey: async () => randomBytes(32).toString('hex'),
  encrypt: async (value, key, context) => {
    const iv = randomBytes(12),
      aes = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    aes.setAAD(Buffer.from(context));
    const result = Buffer.concat([aes.update(value, 'utf8'), aes.final()]);
    return Buffer.concat([iv, result, aes.getAuthTag()]).toString('base64');
  },
  decrypt: async (value, key, context) => {
    const raw = Buffer.from(value, 'base64'),
      aes = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(key, 'hex'),
        raw.subarray(0, 12),
      );
    aes.setAAD(Buffer.from(context));
    aes.setAuthTag(raw.subarray(-16));
    return Buffer.concat([
      aes.update(raw.subarray(12, -16)),
      aes.final(),
    ]).toString('utf8');
  },
};
it('writes ciphertext only, preserves Unicode and uses a fresh nonce per save', async () => {
  const data = memory(),
    keys = memory(),
    store = createEncryptedHistoryStorage(data, keys, cipher);
  const text = 'Private message 私密聊天 💬';
  await store.setItem('owner-a', text);
  const first = data.values.get('owner-a')!;
  expect(first).not.toContain('Private');
  expect(first).not.toContain('私密');
  expect(await store.getItem('owner-a')).toBe(text);
  await store.setItem('owner-a', text);
  expect(data.values.get('owner-a')).not.toBe(first);
});
it('rejects ciphertext copied to a different owner/environment and damaged authentication tags', async () => {
  const data = memory(),
    keys = memory(),
    store = createEncryptedHistoryStorage(data, keys, cipher);
  await store.setItem('owner-a', 'secret');
  data.values.set('owner-b', data.values.get('owner-a')!);
  keys.values.set('key.owner-b', keys.values.get('key.owner-a')!);
  await expect(store.getItem('owner-b')).rejects.toThrow();
  const raw = Buffer.from(data.values.get('owner-a')!, 'base64');
  raw[raw.length - 1] = raw[raw.length - 1]! ^ 1;
  data.values.set('owner-a', raw.toString('base64'));
  await expect(store.getItem('owner-a')).rejects.toThrow();
});
it('never falls back to plaintext or silently generates a new key when the old key is missing', async () => {
  const data = memory(),
    keys = memory(),
    store = createEncryptedHistoryStorage(data, keys, cipher);
  await store.setItem('owner-a', 'secret');
  keys.values.clear();
  await expect(store.getItem('owner-a')).rejects.toThrow();
  expect(keys.values.size).toBe(0);
  await store.removeItem('owner-a');
  expect(data.values.size).toBe(0);
  expect(keys.values.size).toBe(0);
});
