import { expect, it } from '@jest/globals';
import { createHistoryIntentStore } from './history-intents-core';
import {
  owner,
  conversation,
  requestKey,
} from '../../../../tests/fixtures/chat';
const other = '20000000-0000-4000-8000-000000000002';
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => values.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: async (k: string) => {
      values.delete(k);
    },
  };
  return { values, storage, store: createHistoryIntentStore(storage, 'test') };
}
it('persists confirmed actions and reuses the same key across retries and restarts', async () => {
  const { store, storage } = fixture();
  const a = await store.begin(owner, conversation, 'clear', () => requestKey);
  expect(
    await store.begin(owner, conversation, 'clear', () => {
      throw new Error('must reuse');
    }),
  ).toEqual(a);
  expect(await createHistoryIntentStore(storage, 'test').load(owner)).toEqual([
    a,
  ]);
  expect(await store.load(other)).toEqual([]);
  await expect(
    store.begin(owner, conversation, 'delete', () => requestKey),
  ).rejects.toThrow('previous');
  await store.finish(owner, other);
  expect(store.getSnapshot(owner)).toEqual([a]);
  await store.finish(owner, requestKey);
  expect(await createHistoryIntentStore(storage, 'test').load(owner)).toEqual(
    [],
  );
});
it('does not publish an unpersisted action or forget an unconfirmed durable receipt', async () => {
  const { storage } = fixture();
  let fail = true;
  const store = createHistoryIntentStore(
    {
      ...storage,
      setItem: async (k, v) => {
        if (fail) throw new Error('disk');
        await storage.setItem(k, v);
      },
      removeItem: async () => {
        throw new Error('disk');
      },
    },
    'test',
  );
  await expect(
    store.begin(owner, conversation, 'delete', () => requestKey),
  ).rejects.toThrow('disk');
  expect(store.getSnapshot(owner)).toEqual([]);
  fail = false;
  const intent = await store.begin(
    owner,
    conversation,
    'delete',
    () => requestKey,
  );
  await expect(store.finish(owner, requestKey)).rejects.toThrow('disk');
  expect(store.getSnapshot(owner)).toEqual([intent]);
});
