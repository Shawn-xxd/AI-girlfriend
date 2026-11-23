export interface CacheStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}
export interface HistoryCipher {
  generateKey(): Promise<string>;
  encrypt(value: string, key: string, context: string): Promise<string>;
  decrypt(value: string, key: string, context: string): Promise<string>;
}
/** Ciphertext in the data store; per-owner keys exclusively in device secure storage. */
export function createEncryptedHistoryStorage(
  data: CacheStorage,
  keys: CacheStorage,
  cipher: HistoryCipher,
): CacheStorage {
  const queue = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, run: () => Promise<T>): Promise<T> {
    const job = (queue.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(run);
    queue.set(key, job);
    void job
      .finally(() => {
        if (queue.get(key) === job) queue.delete(key);
      })
      .catch(() => undefined);
    return job;
  }
  return {
    getItem: (key) =>
      serial(key, async () => {
        const sealed = await data.getItem(key);
        if (sealed === null) return null;
        if (sealed.length > 300000) throw new Error('History cache too large');
        const secret = await keys.getItem('key.' + key);
        if (!secret || !/^[0-9a-f]{64}$/i.test(secret))
          throw new Error('History cache key unavailable');
        return cipher.decrypt(sealed, secret, key);
      }),
    setItem: (key, value) =>
      serial(key, async () => {
        let secret = await keys.getItem('key.' + key);
        if (!secret) {
          secret = await cipher.generateKey();
          if (!/^[0-9a-f]{64}$/i.test(secret))
            throw new Error('Invalid history key');
          await keys.setItem('key.' + key, secret);
        }
        if (!/^[0-9a-f]{64}$/i.test(secret))
          throw new Error('Invalid history key');
        await data.setItem(key, await cipher.encrypt(value, secret, key));
      }),
    removeItem: (key) =>
      serial(key, async () => {
        await data.removeItem(key);
        await keys.removeItem('key.' + key);
      }),
  };
}
