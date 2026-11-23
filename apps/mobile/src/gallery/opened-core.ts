import { privatePhotoCachePrefix } from './private-photo-source';
export interface PhotoOpenStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
type OpenedPhoto = { opened: boolean; cacheKey?: string };
// Local display preference and cache pointer only; never an entitlement or signed URL.
export function createOpenedPhotoStore(storage: PhotoOpenStorage) {
  const memory = new Map<string, OpenedPhoto>();
  const pending = new Map<string, Promise<OpenedPhoto>>();
  const keyFor = (owner: string, photo: string) =>
    `tempta.opened-photo.v1.${encodeURIComponent(owner)}.${encodeURIComponent(photo)}`;
  function remember(key: string, value: OpenedPhoto) {
    memory.set(key, value);
    if (memory.size > 2000) memory.delete(memory.keys().next().value!);
    return value;
  }
  function read(owner: string, photo: string): Promise<OpenedPhoto> {
    const key = keyFor(owner, photo);
    const known = memory.get(key);
    if (known) return Promise.resolve(known);
    const existing = pending.get(key);
    if (existing) return existing;
    const task = storage
      .getItem(key)
      .then((stored) => {
        const newer = memory.get(key);
        if (newer) return newer;
        // '1' is the existing opened preference; newer values are token-free cache keys.
        const cacheKey = stored?.startsWith(
          privatePhotoCachePrefix(owner, photo),
        )
          ? stored
          : undefined;
        return remember(key, {
          opened: stored === '1' || !!cacheKey,
          cacheKey,
        });
      })
      .catch(() => memory.get(key) ?? { opened: false })
      .finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  return {
    read,
    async has(owner: string, photo: string) {
      return (await read(owner, photo)).opened;
    },
    async mark(owner: string, photo: string, cacheKey?: string) {
      const key = keyFor(owner, photo);
      const safeKey = cacheKey?.startsWith(
        privatePhotoCachePrefix(owner, photo),
      )
        ? cacheKey
        : memory.get(key)?.cacheKey;
      remember(key, { opened: true, cacheKey: safeKey });
      await storage.setItem(key, safeKey ?? '1');
    },
  };
}
