import { z } from 'zod';
import type { QueryClient } from '@tanstack/react-query';
import {
  currentUserSchema,
  conversationListSchema,
  conversationDetailSchema,
  timelinePageSchema,
} from '@companion/shared';
import { MobileApiError } from '../api/core';
import type { CacheStorage } from './encrypted-storage-core';
const MAX_BYTES = 160000,
  MAX_AGE = 7 * 24 * 60 * 60_000;
const snapshotSchema = z.object({
  version: z.literal(1),
  owner: z.uuid(),
  savedAt: z.number().finite(),
  viewer: currentUserSchema,
  list: conversationListSchema.nullable(),
  threads: z
    .array(
      z.object({
        detail: conversationDetailSchema,
        timeline: timelinePageSchema.nullable(),
      }),
    )
    .max(5),
});
type Snapshot = z.infer<typeof snapshotSchema>;
const root = (owner: string) => ['mobile-api', owner] as const;
const keyFor = (namespace: string, owner: string) =>
  `history.v1.${namespace}.${z.uuid().parse(owner)}`;
function bytes(value: string) {
  let size = 0;
  for (const c of value) {
    const n = c.codePointAt(0)!;
    size += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4;
  }
  return size;
}
function character<T extends { coverUrl?: string }>(value: T) {
  const { coverUrl, ...rest } = value;
  void coverUrl;
  return rest;
}
function danger(error: unknown) {
  return (
    error instanceof MobileApiError &&
    ['unauthorized', 'not_found', 'invalid_response'].includes(error.code)
  );
}
function capture(
  client: QueryClient,
  owner: string,
  now: number,
  previous: Snapshot | null,
  denied: ReadonlySet<string>,
): Snapshot | null {
  if (
    danger(client.getQueryState([...root(owner), 'viewer'])?.error) ||
    danger(client.getQueryState([...root(owner), 'conversations'])?.error)
  )
    return null;
  const viewer = currentUserSchema.safeParse(
    client.getQueryData([...root(owner), 'viewer']),
  );
  if (!viewer.success || viewer.data.id !== owner) return null;
  const rawList = conversationListSchema.safeParse(
    client.getQueryData([...root(owner), 'conversations']),
  );
  const list = rawList.success
    ? {
        conversations: rawList.data.conversations
          .filter((row) => !denied.has(row.id))
          .slice(0, 30)
          .map((row) => ({
            ...row,
            character: character(row.character),
            lastMessage: row.lastMessage
              ? {
                  ...row.lastMessage,
                  content:
                    row.lastMessage.content.length > 200
                      ? row.lastMessage.content.slice(0, 200) + '…'
                      : row.lastMessage.content,
                }
              : null,
          })),
      }
    : (previous?.list ?? null);
  const details = client
    .getQueryCache()
    .findAll({ queryKey: [...root(owner), 'conversation'] })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const threads: Snapshot['threads'] = [];
  for (const query of details) {
    const detail = conversationDetailSchema.safeParse(query.state.data);
    if (
      !detail.success ||
      danger(query.state.error) ||
      query.queryKey[3] !== detail.data.id ||
      denied.has(detail.data.id)
    )
      continue;
    if (
      rawList.success &&
      !rawList.data.conversations.some((row) => row.id === detail.data.id)
    )
      continue;
    const data = client.getQueryData<{ pages: unknown[] }>([
      ...root(owner),
      'timeline',
      detail.data.id,
    ]);
    const raw = timelinePageSchema.safeParse(data?.pages[0]);
    let timeline: Snapshot['threads'][number]['timeline'] =
      data === undefined
        ? (previous?.threads.find((row) => row.detail.id === detail.data.id)
            ?.timeline ?? null)
        : null;
    if (raw.success) {
      const entries = raw.data.entries
        .filter((row) => row.kind === 'text' && row.state === 'completed')
        .sort((a, b) => a.sequence - b.sequence)
        .slice(-40);
      while (entries.length > 2 && bytes(JSON.stringify(entries)) > 24000)
        entries.splice(0, 2);
      if (entries.length)
        timeline = {
          ...raw.data,
          entries,
          nextBefore:
            entries.length < raw.data.entries.length
              ? entries[0]!.sequence
              : raw.data.nextBefore,
        };
    }
    threads.push({
      detail: { ...detail.data, character: character(detail.data.character) },
      timeline,
    });
    if (threads.length === 5) break;
  }
  for (const row of previous?.threads ?? []) {
    if (threads.length === 5) break;
    if (
      denied.has(row.detail.id) ||
      threads.some((current) => current.detail.id === row.detail.id)
    )
      continue;
    if (
      rawList.success &&
      !rawList.data.conversations.some((item) => item.id === row.detail.id)
    )
      continue;
    threads.push(JSON.parse(JSON.stringify(row)));
  }
  const result: Snapshot = {
    version: 1,
    owner,
    savedAt: now,
    viewer: viewer.data,
    list,
    threads,
  };
  while (bytes(JSON.stringify(result)) > MAX_BYTES) {
    const target = result.threads.find(
      (row) => (row.timeline?.entries.length ?? 0) > 2,
    );
    if (target?.timeline) {
      target.timeline.entries.splice(0, 2);
      target.timeline.nextBefore = target.timeline.entries[0]!.sequence;
    } else if (result.threads.length) result.threads.pop();
    else if (result.list?.conversations.length) result.list.conversations.pop();
    else return null;
  }
  return result;
}
function validate(value: string, owner: string, now: number): Snapshot {
  if (bytes(value) > MAX_BYTES) throw new Error('Oversize history');
  const data = snapshotSchema.parse(JSON.parse(value));
  if (
    data.owner !== owner ||
    data.viewer.id !== owner ||
    data.savedAt > now + 60_000 ||
    now - data.savedAt > MAX_AGE
  )
    throw new Error('Stale or mismatched history');
  // Strictly reject access grants, photo rows and signed image URLs even in old/corrupt caches.
  const values = data.list?.conversations ?? [];
  if (
    values.some((row) => row.character.coverUrl) ||
    data.threads.some(
      (row) =>
        row.detail.character.coverUrl ||
        row.timeline?.entries.some(
          (entry) => entry.kind !== 'text' || entry.state !== 'completed',
        ),
    )
  )
    throw new Error('Invalid history fields');
  if (
    (data.list?.conversations.length ?? 0) > 30 ||
    data.threads.some(
      (row) =>
        row.detail.characterId !== row.detail.character.id ||
        (row.timeline?.entries.length ?? 0) > 40,
    )
  )
    throw new Error('Mismatched character');
  return data;
}
/** Read/write only the currently restored owner's validated text cache. No generic query dehydration. */
export function connectHistoryCache(
  client: QueryClient,
  storage: CacheStorage,
  namespace: string,
  owner: string,
  isCurrent: () => boolean,
  now = Date.now,
) {
  const key = keyFor(namespace, owner);
  let active = true,
    blocked = false,
    lastBody = '',
    writing = false,
    pending: string | null = null;
  let saved: Snapshot | null = null;
  const denied = new Set<string>();
  let writes = Promise.resolve();
  let unsubscribe = () => {};
  const valid = () => active && isCurrent();
  const remove = () => {
    pending = null;
    saved = null;
    lastBody = '';
    writes = writes
      .catch(() => undefined)
      .then(async () => {
        await storage.removeItem(key);
      })
      .catch(() => undefined);
    return writes;
  };
  function persist() {
    if (!valid() || blocked) return;
    const snapshot = capture(client, owner, now(), saved, denied);
    if (!snapshot) return;
    const body = JSON.stringify({ ...snapshot, savedAt: 0 });
    if (body === lastBody && saved && now() - saved.savedAt < 24 * 60 * 60_000)
      return;
    lastBody = body;
    saved = snapshot;
    pending = JSON.stringify(snapshot);
    drain();
  }
  function drain() {
    if (writing || !pending) return;
    writing = true;
    writes = writes
      .catch(() => undefined)
      .then(async () => {
        while (pending && valid() && !blocked) {
          const value = pending;
          pending = null;
          try {
            await storage.setItem(key, value);
          } catch {
            lastBody = '';
          }
        }
      })
      .finally(() => {
        writing = false;
        if (pending && valid() && !blocked) drain();
      });
  }
  const ready = (async () => {
    try {
      const value = await storage.getItem(key);
      if (value !== null && valid()) {
        const data = validate(value, owner, now());
        const rejected = client
          .getQueryCache()
          .findAll({ queryKey: root(owner) })
          .filter((query) => danger(query.state.error));
        if (rejected.length) {
          blocked = true;
          for (const query of rejected) {
            if (
              (query.queryKey[2] === 'conversation' ||
                query.queryKey[2] === 'timeline') &&
              typeof query.queryKey[3] === 'string'
            )
              denied.add(query.queryKey[3]);
          }
          throw new Error('Rejected owner cache');
        }
        function seed(queryKey: readonly unknown[], value: unknown) {
          if (!client.getQueryData(queryKey))
            client.setQueryData(queryKey, value, { updatedAt: 0 });
        }
        seed([...root(owner), 'viewer'], data.viewer);
        if (data.list) seed([...root(owner), 'conversations'], data.list);
        const liveList = client.getQueryState([
          ...root(owner),
          'conversations',
        ]);
        const liveRows = conversationListSchema.safeParse(liveList?.data);
        for (const row of data.threads) {
          if (
            liveRows.success &&
            (liveList?.dataUpdatedAt ?? 0) > 0 &&
            !liveRows.data.conversations.some(
              (item) => item.id === row.detail.id,
            )
          )
            continue;
          seed([...root(owner), 'conversation', row.detail.id], row.detail);
          if (row.timeline)
            seed([...root(owner), 'timeline', row.detail.id], {
              pages: [row.timeline],
              pageParams: [undefined],
            });
        }
        saved = data;
        lastBody = JSON.stringify({ ...data, savedAt: 0 });
      }
    } catch {
      if (valid()) await remove();
    }
    if (!valid()) return;
    unsubscribe = client.getQueryCache().subscribe((event) => {
      const query = event.query;
      if (
        query.queryKey[0] !== 'mobile-api' ||
        query.queryKey[1] !== owner ||
        !['viewer', 'conversations', 'conversation', 'timeline'].includes(
          String(query.queryKey[2]),
        )
      )
        return;
      if (
        event.type === 'updated' &&
        event.action.type === 'error' &&
        danger(event.action.error)
      ) {
        blocked = true;
        if (
          (query.queryKey[2] === 'conversation' ||
            query.queryKey[2] === 'timeline') &&
          typeof query.queryKey[3] === 'string'
        )
          denied.add(query.queryKey[3]);
        void remove();
        return;
      }
      if (event.type === 'updated' && event.action.type === 'success') {
        if (query.queryKey[2] === 'viewer') blocked = false;
        if (
          (query.queryKey[2] === 'conversation' ||
            query.queryKey[2] === 'timeline') &&
          typeof query.queryKey[3] === 'string'
        )
          denied.delete(query.queryKey[3]);
        persist();
      }
      if (event.type === 'removed') {
        lastBody = '';
        persist();
      }
    });
    persist();
  })();
  return {
    ready,
    flush: async () => {
      persist();
      do {
        const current = writes;
        await current;
        if (current === writes && !pending) break;
      } while (valid() && !blocked);
    },
    stop: (purge = false) => {
      active = false;
      pending = null;
      unsubscribe();
      if (purge) return remove();
      return writes;
    },
  };
}
