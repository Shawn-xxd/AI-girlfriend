import { expect, it } from '@jest/globals';
import { createOpenedPhotoStore } from './opened-core';
it('remembers display state across store recreation and scopes it to owner and photo', async () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const first = createOpenedPhotoStore(storage);
  await first.mark('owner-a', 'photo-a');
  const restarted = createOpenedPhotoStore(storage);
  expect(await restarted.has('owner-a', 'photo-a')).toBe(true);
  expect(await restarted.has('owner-b', 'photo-a')).toBe(false);
  expect(await restarted.has('owner-a', 'photo-b')).toBe(false);
  expect([...data.values()]).toEqual(['1']);
});
it('does not let a late storage read undo an image opened while loading', async () => {
  let resolve!: (value: string | null) => void;
  const store = createOpenedPhotoStore({
    getItem: () =>
      new Promise((done) => {
        resolve = done;
      }),
    setItem: async () => undefined,
  });
  const reading = store.has('a', 'p');
  await store.mark('a', 'p');
  resolve(null);
  expect(await reading).toBe(true);
});
it('treats unreadable local preferences as closed without granting access', async () => {
  const store = createOpenedPhotoStore({
    getItem: async () => {
      throw new Error('offline storage');
    },
    setItem: async () => undefined,
  });
  expect(await store.has('a', 'p')).toBe(false);
});
