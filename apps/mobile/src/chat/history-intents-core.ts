import { z } from 'zod';
import type { PendingStorage } from './pending-core';
const intentSchema = z
  .object({
    conversationId: z.uuid(),
    requestKey: z.uuid(),
    action: z.enum(['clear', 'delete']),
  })
  .strict();
export type HistoryIntent = z.infer<typeof intentSchema>;
const empty: readonly HistoryIntent[] = [];
/** Persist the user's confirmed intent before touching the server or old caches. */
export function createHistoryIntentStore(
  storage: PendingStorage,
  namespace: string,
) {
  const snapshots = new Map<string, readonly HistoryIntent[]>();
  const queues = new Map<string, Promise<unknown>>();
  const listeners = new Map<string, Set<() => void>>();
  const key = (owner: string) =>
    `history.actions.${namespace}.${z.uuid().parse(owner)}`;
  function serial<T>(owner: string, action: () => Promise<T>): Promise<T> {
    const next = (queues.get(owner) ?? Promise.resolve())
      .catch(() => undefined)
      .then(action);
    queues.set(owner, next);
    void next
      .finally(() => {
        if (queues.get(owner) === next) queues.delete(owner);
      })
      .catch(() => undefined);
    return next;
  }
  const publish = (owner: string, value: readonly HistoryIntent[]) => {
    snapshots.set(owner, value);
    listeners.get(owner)?.forEach((notify) => notify());
  };
  async function read(owner: string) {
    if (snapshots.has(owner)) return snapshots.get(owner)!;
    const raw = await storage.getItem(key(owner));
    const parsed =
      raw === null ? [] : z.array(intentSchema).max(512).parse(JSON.parse(raw));
    publish(owner, parsed);
    return parsed;
  }
  return {
    getSnapshot: (owner: string) => snapshots.get(owner) ?? empty,
    subscribe: (owner: string, notify: () => void) => {
      const set = listeners.get(owner) ?? new Set();
      set.add(notify);
      listeners.set(owner, set);
      return () => {
        set.delete(notify);
      };
    },
    load: (owner: string) => serial(owner, () => read(owner)),
    begin: (
      owner: string,
      conversationId: string,
      action: HistoryIntent['action'],
      uuid: () => string,
    ) =>
      serial(owner, async () => {
        const current = await read(owner);
        const existing = current.find(
          (item) => item.conversationId === conversationId,
        );
        if (existing) {
          if (existing.action !== action)
            throw new Error('Please retry the previous chat action first.');
          return existing;
        }
        const next = intentSchema.parse({
          conversationId,
          action,
          requestKey: uuid(),
        });
        const value = [...current, next];
        await storage.setItem(key(owner), JSON.stringify(value));
        publish(owner, value);
        return next;
      }),
    finish: (owner: string, requestKey: string) =>
      serial(owner, async () => {
        const current = await read(owner);
        const value = current.filter((item) => item.requestKey !== requestKey);
        if (value.length)
          await storage.setItem(key(owner), JSON.stringify(value));
        else await storage.removeItem(key(owner));
        publish(owner, value);
      }),
  };
}
