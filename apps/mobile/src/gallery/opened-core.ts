export interface PhotoOpenStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
// Local display preference only. Server entitlements and availability still gate every image.
export function createOpenedPhotoStore(storage: PhotoOpenStorage) {
  const memory = new Map<string, boolean>();
  const pending = new Map<string, Promise<boolean>>();
  const keyFor = (owner: string, photo: string) =>
    `tempta.opened-photo.v1.${encodeURIComponent(owner)}.${encodeURIComponent(photo)}`;
  function remember(key: string, value: boolean) {
    memory.set(key, value);
    if (memory.size > 2000) memory.delete(memory.keys().next().value!);
  }
  return {
    has(owner: string, photo: string): Promise<boolean> {
      const key = keyFor(owner, photo);
      if (memory.has(key)) return Promise.resolve(memory.get(key)!);
      const existing = pending.get(key);
      if (existing) return existing;
      const task = storage
        .getItem(key)
        .then((stored) => {
          const value = memory.get(key) ?? stored === '1';
          remember(key, value);
          return value;
        })
        .catch(() => memory.get(key) ?? false)
        .finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    },
    async mark(owner: string, photo: string) {
      const key = keyFor(owner, photo);
      remember(key, true);
      await storage.setItem(key, '1');
    },
  };
}
