import { expect, it, jest } from '@jest/globals';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  viewerQuery,
  viewerOwner,
  catalogQuery,
  conversationsQuery,
  blockingLoadError,
  detailQuery,
  timelineQuery,
} from './loading-policy';
import { MobileApiError, apiErrorForStatus } from './core';
import { createChatPreloader } from './preload-chat-core';
const owner = '11111111-1111-4111-8111-111111111111';
const viewer = { id: owner, createdAt: '2026-11-21T00:00:00.000Z' };
const guest = { status: 'ready' as const, error: null, owner };
const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
it('keeps a verified owner during refresh, hides foreign/stale-session data and never hides authorization failures', () => {
  expect(viewerOwner(guest, viewer, null)).toBe(owner);
  expect(viewerOwner(guest, viewer, new MobileApiError('unavailable'))).toBe(
    owner,
  );
  for (const status of ['loading', 'error', 'idle'] as const)
    expect(viewerOwner({ ...guest, status }, viewer, null)).toBeUndefined();
  expect(
    viewerOwner({ ...guest, owner: 'different-owner' }, viewer, null),
  ).toBeUndefined();
  expect(viewerOwner(guest, undefined, null)).toBeUndefined();
  for (const code of [
    'unauthorized',
    'invalid_response',
    'configuration',
  ] as const)
    expect(
      viewerOwner(guest, viewer, new MobileApiError(code)),
    ).toBeUndefined();
  expect(blockingLoadError(new MobileApiError('unavailable'), undefined)).toBe(
    true,
  );
  expect(blockingLoadError(apiErrorForStatus(403), viewer)).toBe(true);
});
it('deduplicates simultaneous first mounts and keeps fresh viewer data on navigation', async () => {
  const client = makeClient();
  const load = jest.fn(async () => viewer);
  const options = viewerQuery(owner, load);
  const first = new QueryObserver(client, options);
  const second = new QueryObserver(client, options);
  const a = first.subscribe(() => {}),
    b = second.subscribe(() => {});
  await client.fetchQuery(options);
  expect(load).toHaveBeenCalledTimes(1);
  a();
  b();
  const next = new QueryObserver(client, options);
  const c = next.subscribe(() => {});
  expect(next.getCurrentResult().data?.id).toBe(owner);
  expect(next.getCurrentResult().isFetching).toBe(false);
  expect(load).toHaveBeenCalledTimes(1);
  c();
  client.clear();
});
it('background viewer refresh retains cached owner while a new owner never receives that cache', async () => {
  const client = makeClient();
  const options = viewerQuery(owner, async () => viewer);
  client.setQueryData(options.queryKey, viewer);
  let complete!: (value: typeof viewer) => void;
  const refreshing = client.fetchQuery({
    ...options,
    staleTime: 0,
    queryFn: () =>
      new Promise<typeof viewer>((resolve) => {
        complete = resolve;
      }),
  });
  expect(client.isFetching({ queryKey: options.queryKey })).toBe(1);
  expect(viewerOwner(guest, client.getQueryData(options.queryKey), null)).toBe(
    owner,
  );
  expect(
    client.getQueryData(viewerQuery('other', async () => viewer).queryKey),
  ).toBeUndefined();
  complete(viewer);
  await refreshing;
  client.clear();
});
it('focus and prefetched list mounts share fresh requests and keep cached rows during refresh failures', async () => {
  const client = makeClient();
  const characters = jest.fn(async () => ({ characters: [] }));
  const threads = jest.fn(async () => ({ conversations: [] }));
  const catalog = catalogQuery(owner, characters),
    list = conversationsQuery(owner, threads);
  await Promise.all([
    client.fetchQuery(catalog),
    client.fetchQuery(catalog),
    client.prefetchQuery(list),
  ]);
  const observer = new QueryObserver(client, list);
  const unsub = observer.subscribe(() => {});
  await client.fetchQuery(list);
  expect(characters).toHaveBeenCalledTimes(1);
  expect(threads).toHaveBeenCalledTimes(1);
  await client
    .fetchQuery({
      ...list,
      staleTime: 0,
      queryFn: async () => {
        throw new MobileApiError('unavailable');
      },
    })
    .catch(() => undefined);
  expect(
    blockingLoadError(
      client.getQueryState(list.queryKey)?.error,
      client.getQueryData(list.queryKey),
    ),
  ).toBe(false);
  unsub();
  client.clear();
});
it('preloads detail and timeline in parallel, reuses their data and scopes the seed to its owner', async () => {
  const client = makeClient();
  const character = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Mei',
    archetype: 'Creative',
    bio: 'Hello',
    tags: [],
  };
  const summary = {
    id: '33333333-3333-4333-8333-333333333333',
    characterId: character.id,
    createdAt: viewer.createdAt,
    character,
    lastMessage: null,
  };
  const progress = { level: 1, effectiveChatCount: 0, nextLevel: null };
  const conversation = jest.fn(async () => summary),
    timeline = jest.fn(async () => ({
      entries: [],
      nextBefore: null,
      progress,
    })),
    conversations = jest.fn(async () => ({ conversations: [summary] }));
  client.setQueryData(conversationsQuery(owner, conversations).queryKey, {
    conversations: [summary],
  });
  const preload = createChatPreloader({
    conversation,
    timeline,
    conversations,
  });
  const job = preload(client, owner, summary.id);
  expect(conversation).toHaveBeenCalledTimes(1);
  expect(timeline).toHaveBeenCalledTimes(1);
  expect(
    client.getQueryData(detailQuery(owner, summary.id, conversation).queryKey),
  ).toMatchObject({ character });
  expect(
    client.getQueryData(
      detailQuery('other', summary.id, conversation).queryKey,
    ),
  ).toBeUndefined();
  await job;
  await Promise.all([
    client.fetchQuery(detailQuery(owner, summary.id, conversation)),
    client.fetchInfiniteQuery(timelineQuery(owner, summary.id, timeline)),
  ]);
  expect(conversation).toHaveBeenCalledTimes(1);
  expect(timeline).toHaveBeenCalledTimes(1);
  client.clear();
});

it('rejects a mismatched viewer response instead of caching a foreign identity as usable', async () => {
  const client = makeClient();
  await expect(
    client.fetchQuery(
      viewerQuery(owner, async () => ({ ...viewer, id: 'other' })),
    ),
  ).rejects.toMatchObject({ code: 'unauthorized' });
  expect(
    client.getQueryData(viewerQuery(owner, async () => viewer).queryKey),
  ).toBeUndefined();
  client.clear();
});
