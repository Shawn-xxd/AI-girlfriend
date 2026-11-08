import { describe, it, expect } from '@jest/globals';
import { createPendingStore } from './pending-core';
import {
  owner,
  conversation,
  requestKey,
} from '../../../../tests/fixtures/chat';
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
  return { values, storage, store: createPendingStore(storage) };
}
describe('pending chat recovery', () => {
  it('reuses the same request key after a restart and serializes duplicate preparations', async () => {
    const { store, storage } = fixture();
    let generated = 0;
    const uuid = () => {
      generated++;
      return requestKey;
    };
    const [a, b] = await Promise.all([
      store.prepare(owner, conversation, ' Hello ', uuid),
      store.prepare(owner, conversation, 'Hello', uuid),
    ]);
    expect(a).toEqual(b);
    expect(generated).toBe(1);
    expect(
      await createPendingStore(storage).prepare(
        owner,
        conversation,
        'Hello',
        uuid,
      ),
    ).toEqual(a);
    expect(generated).toBe(1);
  });
  it('isolates identities and conversations and ignores stale completion cleanup', async () => {
    const { store } = fixture();
    await store.prepare(owner, conversation, 'Hello', () => requestKey);
    expect(
      await store.load('20000000-0000-4000-8000-000000000002', conversation),
    ).toBeNull();
    const second = '40000000-0000-4000-8000-000000000002';
    await store.prepare(owner, conversation, 'Edited', () => second);
    await store.clear(owner, conversation, requestKey);
    expect((await store.load(owner, conversation))?.requestKey).toBe(second);
  });
  it('fails closed on corrupt or unwritable storage instead of minting a replacement key', async () => {
    const { values, store } = fixture();
    values.set(`chat.pending.${owner}.${conversation}`, 'invalid');
    let generated = 0;
    await expect(
      store.prepare(owner, conversation, 'Hello', () => {
        generated++;
        return requestKey;
      }),
    ).rejects.toThrow();
    expect(generated).toBe(0);
    const broken = createPendingStore({
      getItem: async () => null,
      setItem: async () => {
        throw new Error('disk');
      },
      removeItem: async () => {},
    });
    await expect(
      broken.prepare(owner, conversation, 'Hello', () => requestKey),
    ).rejects.toThrow();
  });
});
