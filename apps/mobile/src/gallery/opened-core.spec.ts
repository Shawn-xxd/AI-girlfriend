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
it('restores a token-free native cache pointer across restart without crossing owners', async () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const key = 'tempta.private-photo.v1.a.p.https://storage/object-v1';
  const first = createOpenedPhotoStore(storage);
  await first.mark('a', 'p', key);
  const restarted = createOpenedPhotoStore(storage);
  expect(await restarted.read('a', 'p')).toEqual({
    opened: true,
    cacheKey: key,
  });
  expect(await restarted.read('b', 'p')).toEqual({
    opened: false,
    cacheKey: undefined,
  });
  await restarted.mark(
    'a',
    'p',
    'tempta.private-photo.v1.a.p.https://storage/object-v2',
  );
  expect(
    (await createOpenedPhotoStore(storage).read('a', 'p')).cacheKey,
  ).toContain('object-v2');
});
it('does not let an older disk lookup replace a newer loaded file version', async () => {
  let resolve!: (value: string | null) => void;
  const store = createOpenedPhotoStore({
    getItem: () =>
      new Promise((done) => {
        resolve = done;
      }),
    setItem: async () => undefined,
  });
  const reading = store.read('a', 'p');
  const key = 'tempta.private-photo.v1.a.p.new-version';
  await store.mark('a', 'p', key);
  resolve('tempta.private-photo.v1.a.p.old-version');
  expect((await reading).cacheKey).toBe(key);
});
it('rejects another owner or photo cache pointer', async () => {
  const store = createOpenedPhotoStore({
    getItem: async () => 'tempta.private-photo.v1.other.p.some-file',
    setItem: async () => undefined,
  });
  expect((await store.read('a', 'p')).opened).toBe(false);
  await store.mark('a', 'p', 'tempta.private-photo.v1.other.p.some-file');
  expect(await store.read('a', 'p')).toEqual({
    opened: true,
    cacheKey: undefined,
  });
});
it('notifies only the current owner after a successful file receipt and unsubscribes cleanly', async () => {
  const store = createOpenedPhotoStore({
    getItem: async () => null,
    setItem: async () => undefined,
  });
  let changes = 0;
  const stop = store.subscribe('a', () => {
    changes += 1;
  });
  await store.mark('a', 'p');
  expect(store.hasDisplayed('a', 'p')).toBe(false);
  expect(changes).toBe(0);
  await store.mark('b', 'p', 'tempta.private-photo.v1.b.p.file');
  expect(changes).toBe(0);
  await store.mark('a', 'p', 'tempta.private-photo.v1.a.p.file');
  expect(store.hasDisplayed('a', 'p')).toBe(true);
  expect(changes).toBe(1);
  stop();
  await store.mark('a', 'p', 'tempta.private-photo.v1.a.p.replacement');
  expect(changes).toBe(1);
});
