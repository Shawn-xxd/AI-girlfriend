import { expect, it } from '@jest/globals';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { connectHistoryCache } from './history-core';
import {
  viewerQuery,
  viewerOwner,
  conversationsQuery,
  timelineQuery,
  detailQuery,
} from '../api/loading-policy';
import { MobileApiError } from '../api/core';
const owner = '11111111-1111-4111-8111-111111111111',
  other = '99999999-9999-4999-8999-999999999999',
  id = '22222222-2222-4222-8222-222222222222',
  characterId = '33333333-3333-4333-8333-333333333333';
const date = '2026-11-23T00:00:00.000Z';
const viewer = { id: owner, createdAt: date };
const detail = {
  id,
  characterId,
  createdAt: date,
  character: {
    id: characterId,
    name: 'Mei',
    archetype: 'Creative',
    bio: 'Hello',
    tags: [],
    coverUrl: 'https://example.test/signed?token=do-not-persist',
  },
};
const text = (n: number, content = 'A private conversation') => ({
  kind: 'text' as const,
  id: `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`,
  turnId: '55555555-5555-4555-8555-555555555555',
  requestKey: '66666666-6666-4666-8666-666666666666',
  role: 'assistant' as const,
  content,
  sequence: n,
  createdAt: date,
  state: 'completed' as const,
  leaseExpiresAt: null,
});
const progress = { level: 1, effectiveChatCount: 1, nextLevel: null };
const page = { entries: [text(1), text(2)], nextBefore: null, progress };
const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
function disk() {
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
function seed(client: QueryClient) {
  client.setQueryData(['mobile-api', owner, 'viewer'], viewer);
  client.setQueryData(['mobile-api', owner, 'conversations'], {
    conversations: [
      {
        ...detail,
        lastMessage: {
          role: 'assistant',
          content: 'A private conversation',
          createdAt: date,
        },
      },
    ],
  });
  client.setQueryData(['mobile-api', owner, 'conversation', id], detail);
  client.setQueryData(['mobile-api', owner, 'timeline', id], {
    pages: [page],
    pageParams: [undefined],
  });
}
async function saved() {
  const storage = disk(),
    client = makeClient();
  seed(client);
  const connection = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 1000,
  );
  await connection.ready;
  await connection.flush();
  await connection.stop();
  client.clear();
  return storage;
}
it('restores same-owner text into a new process cache before background requests finish', async () => {
  const storage = await saved(),
    client = makeClient();
  const cache = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 2000,
  );
  await cache.ready;
  const guest = { owner, status: 'ready' as const, error: null };
  const me = client.getQueryData<typeof viewer>([
    'mobile-api',
    owner,
    'viewer',
  ]);
  expect(viewerOwner(guest, me, null)).toBe(owner);
  let release!: (value: typeof viewer) => void;
  const options = viewerQuery(
    owner,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const observer = new QueryObserver(client, options);
  const stop = observer.subscribe(() => {});
  expect(observer.getCurrentResult().data?.id).toBe(owner);
  expect(observer.getCurrentResult().isPending).toBe(false);
  expect(observer.getCurrentResult().isFetching).toBe(true);
  const history = client.getQueryData<{ pages: (typeof page)[] }>([
    'mobile-api',
    owner,
    'timeline',
    id,
  ]);
  expect(history?.pages[0]?.entries[0]?.content).toBe('A private conversation');
  release(viewer);
  await client.fetchQuery(options);
  stop();
  await cache.stop();
  client.clear();
});
it('persists only approved text/metadata, never image grants, signed URLs, wallet or pending generations', async () => {
  const storage = disk(),
    client = makeClient();
  seed(client);
  client.setQueryData(['mobile-api', owner, 'wallet'], {
    availableDiamonds: 999,
  });
  client.setQueryData(['mobile-api', owner, 'photo-access', id], {
    url: 'https://example.test/private?token=secret',
  });
  client.setQueryData(['mobile-api', owner, 'timeline', id], {
    pages: [
      {
        ...page,
        entries: [
          ...page.entries,
          { ...text(3), state: 'pending', content: 'Not completed' },
          {
            kind: 'photo',
            id: '77777777-7777-4777-8777-777777777777',
            role: 'assistant',
            sequence: 4,
            createdAt: date,
            photo: {
              id: '88888888-8888-4888-8888-888888888888',
              kind: 'level',
              title: 'PRIVATE_CACHE_TEST',
              requiredLevel: 1,
              unlocked: true,
              available: true,
            },
          },
        ],
      },
    ],
    pageParams: [undefined],
  });
  const cache = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 1000,
  );
  await cache.ready;
  await cache.flush();
  const raw = [...storage.values.values()][0]!;
  expect(raw).not.toContain('token=');
  expect(raw).not.toContain('availableDiamonds');
  expect(raw).not.toContain('Not completed');
  expect(raw).not.toContain('coverUrl');
  expect(raw).not.toContain('PRIVATE_CACHE_TEST');
  expect(raw).not.toContain('unlocked');
  expect(JSON.parse(raw).threads[0].timeline.entries).toHaveLength(2);
  await cache.stop();
  client.clear();
});
it('does not restore another owner, another environment, corrupt or expired snapshots', async () => {
  const storage = await saved();
  for (const [namespace, who, clock] of [
    ['test', other, 2000],
    ['different', owner, 2000],
    ['test', owner, 8 * 24 * 3600000],
  ] as const) {
    const client = makeClient();
    const cache = connectHistoryCache(
      client,
      storage,
      namespace,
      who,
      () => true,
      () => clock,
    );
    await cache.ready;
    expect(client.getQueryData(['mobile-api', who, 'viewer'])).toBeUndefined();
    await cache.stop();
    client.clear();
  }
  const client = makeClient();
  storage.values.set(`history.v1.test.${owner}`, 'broken json');
  const cache = connectHistoryCache(client, storage, 'test', owner, () => true);
  await cache.ready;
  expect(storage.values.size).toBe(0);
  await cache.stop();
  client.clear();
});
it('does not overwrite newer network results when disk reads finish late', async () => {
  const storage = await saved();
  let finish!: (v: string | null) => void;
  const slow = {
    ...storage,
    getItem: () =>
      new Promise<string | null>((resolve) => {
        finish = resolve;
      }),
  };
  const client = makeClient();
  const cache = connectHistoryCache(
    client,
    slow,
    'test',
    owner,
    () => true,
    () => 2000,
  );
  client.setQueryData(['mobile-api', owner, 'viewer'], viewer);
  client.setQueryData(['mobile-api', owner, 'conversations'], {
    conversations: [],
  });
  finish([...storage.values.values()][0]!);
  await cache.ready;
  expect(client.getQueryData(['mobile-api', owner, 'conversations'])).toEqual({
    conversations: [],
  });
  expect(
    client.getQueryData(['mobile-api', owner, 'conversation', id]),
  ).toBeUndefined();
  await cache.stop();
  client.clear();
});
it('discards a late cache read after identity changes', async () => {
  const storage = await saved();
  let finish!: (v: string | null) => void,
    current = true;
  const client = makeClient();
  const cache = connectHistoryCache(
    client,
    {
      ...storage,
      getItem: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    'test',
    owner,
    () => current,
    () => 2000,
  );
  current = false;
  finish([...storage.values.values()][0]!);
  await cache.ready;
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  await cache.stop();
  client.clear();
});
it('purges known authorization failures without queued writes resurrecting the cache', async () => {
  const storage = await saved(),
    client = makeClient();
  const cache = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 2000,
  );
  await cache.ready;
  await client
    .fetchQuery({
      ...detailQuery(owner, id, async () => detail),
      staleTime: 0,
      queryFn: async () => {
        throw new MobileApiError('unauthorized');
      },
    })
    .catch(() => undefined);
  await cache.flush();
  expect(storage.values.size).toBe(0);
  await cache.stop();
  client.clear();
});
it('restores recent records despite transient refresh errors and keeps cached text after memory GC', async () => {
  const storage = await saved(),
    client = makeClient();
  const cache = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 2000,
  );
  await cache.ready;
  client.removeQueries({ queryKey: ['mobile-api', owner, 'timeline', id] });
  await cache.flush();
  await cache.stop();
  client.clear();
  const next = makeClient();
  const restored = connectHistoryCache(
    next,
    storage,
    'test',
    owner,
    () => true,
    () => 3000,
  );
  await restored.ready;
  expect(
    next.getQueryData(['mobile-api', owner, 'timeline', id]),
  ).toBeDefined();
  await next
    .fetchQuery({
      ...conversationsQuery(owner, async () => ({ conversations: [] })),
      queryFn: async () => {
        throw new MobileApiError('unavailable');
      },
    })
    .catch(() => undefined);
  expect(
    next.getQueryData(['mobile-api', owner, 'conversations']),
  ).toBeDefined();
  await restored.stop();
  next.clear();
});
it('bounds the persisted history without truncating individual messages', async () => {
  const storage = disk(),
    client = makeClient();
  seed(client);
  client.setQueryData(['mobile-api', owner, 'timeline', id], {
    pages: [
      {
        ...page,
        entries: Array.from({ length: 50 }, (_, i) =>
          text(i + 1, '长'.repeat(4000)),
        ),
      },
    ],
    pageParams: [undefined],
  });
  const cache = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 1000,
  );
  await cache.ready;
  await cache.flush();
  const raw = [...storage.values.values()][0]!;
  expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(160000);
  const entries = JSON.parse(raw).threads[0].timeline.entries;
  expect(entries.length).toBeLessThan(40);
  expect(entries.at(-1).content).toBe('长'.repeat(4000));
  await cache.stop();
  client.clear();
});
it('background timeline refresh keeps restored rows while a slow request is pending', async () => {
  const storage = await saved(),
    client = makeClient();
  const cache = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 2000,
  );
  await cache.ready;
  let finish!: (p: typeof page) => void;
  const options = timelineQuery(
    owner,
    id,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const refresh = client.fetchInfiniteQuery(options);
  expect(
    client.getQueryData<{ pages: (typeof page)[] }>(options.queryKey)?.pages[0]
      ?.entries.length,
  ).toBe(2);
  finish(page);
  await refresh;
  await cache.stop();
  client.clear();
});

it('clears a partially-written snapshot after permission rejection, even with a write in progress', async () => {
  const storage = disk(),
    client = makeClient();
  seed(client);
  let complete!: () => void;
  const slow = {
    ...storage,
    setItem: async (k: string, v: string) => {
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      storage.values.set(k, v);
    },
  };
  const cache = connectHistoryCache(
    client,
    slow,
    'test',
    owner,
    () => true,
    () => 1000,
  );
  await cache.ready;
  await client
    .fetchQuery({
      ...detailQuery(owner, id, async () => detail),
      staleTime: 0,
      queryFn: async () => {
        throw new MobileApiError('unauthorized');
      },
    })
    .catch(() => undefined);
  complete();
  await cache.flush();
  expect(storage.values.size).toBe(0);
  await cache.stop();
  client.clear();
});
it('cache IO failures leave live data and restored identity intact', async () => {
  const client = makeClient();
  seed(client);
  const failed = {
    getItem: async () => {
      throw new Error('disk');
    },
    setItem: async () => {
      throw new Error('disk');
    },
    removeItem: async () => {
      throw new Error('disk');
    },
  };
  const cache = connectHistoryCache(client, failed, 'test', owner, () => true);
  await cache.ready;
  await cache.flush();
  expect(client.getQueryData(['mobile-api', owner, 'viewer'])).toEqual(viewer);
  expect(
    client.getQueryData(['mobile-api', owner, 'timeline', id]),
  ).toBeDefined();
  await cache.stop();
  client.clear();
});

it('does not resurrect a rejected conversation when a later viewer refresh succeeds', async () => {
  const storage = await saved(),
    client = makeClient();
  const cache = connectHistoryCache(
    client,
    storage,
    'test',
    owner,
    () => true,
    () => 2000,
  );
  await cache.ready;
  await client
    .fetchQuery({
      ...detailQuery(owner, id, async () => detail),
      staleTime: 0,
      queryFn: async () => {
        throw new MobileApiError('not_found');
      },
    })
    .catch(() => undefined);
  await client.fetchInfiniteQuery({
    ...timelineQuery(owner, id, async () => page),
    staleTime: 0,
  });
  await client.fetchQuery({
    ...viewerQuery(owner, async () => viewer),
    staleTime: 0,
  });
  await cache.flush();
  const raw = [...storage.values.values()][0];
  if (raw) {
    const snapshot = JSON.parse(raw);
    expect(snapshot.threads).toEqual([]);
    expect(snapshot.list.conversations).toEqual([]);
  }
  await cache.stop();
  client.clear();
});
