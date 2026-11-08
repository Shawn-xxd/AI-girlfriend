import { z } from 'zod';
export interface PendingStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}
const pendingSchema = z
  .object({ requestKey: z.uuid(), text: z.string().trim().min(1).max(4000) })
  .strict();
export type PendingMessage = z.infer<typeof pendingSchema>;
/** All operations use the verified owner and conversation, never a display name. */
export function createPendingStore(storage: PendingStorage) {
  const queues = new Map<string, Promise<unknown>>();
  const key = (owner: string, id: string) =>
    `chat.pending.${z.uuid().parse(owner)}.${z.uuid().parse(id)}`;
  function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
    const next = (queues.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(action);
    queues.set(key, next);
    void next
      .finally(() => {
        if (queues.get(key) === next) queues.delete(key);
      })
      .catch(() => undefined);
    return next;
  }
  const read = async (key: string) => {
    const raw = await storage.getItem(key);
    return raw === null ? null : pendingSchema.parse(JSON.parse(raw));
  };
  return {
    load: (owner: string, id: string) => {
      const scoped = key(owner, id);
      return serial(scoped, () => read(scoped));
    },
    prepare: (owner: string, id: string, text: string, uuid: () => string) => {
      const scoped = key(owner, id);
      return serial(scoped, async () => {
        const current = await read(scoped);
        if (current?.text === text.trim()) return current;
        const next = pendingSchema.parse({ requestKey: uuid(), text });
        await storage.setItem(scoped, JSON.stringify(next));
        return next;
      });
    },
    remember: (owner: string, id: string, pending: PendingMessage) => {
      const scoped = key(owner, id);
      return serial(scoped, () =>
        storage.setItem(scoped, JSON.stringify(pendingSchema.parse(pending))),
      );
    },
    clear: (owner: string, id: string, requestKey: string) => {
      const scoped = key(owner, id);
      return serial(scoped, async () => {
        const current = await read(scoped);
        if (current?.requestKey === requestKey)
          await storage.removeItem(scoped);
      });
    },
  };
}
