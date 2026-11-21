/** Public role covers only. Never pass private-photo access URLs into this queue. */
export function createCoverPrefetcher(
  load: (uri: string) => Promise<unknown>,
  now = Date.now,
) {
  type Entry = { promise: Promise<void>; expires: number };
  const entries = new Map<string, Entry>();
  const queue: (() => Promise<void>)[] = [];
  let active = 0;
  function pump() {
    while (active < 2 && queue.length) {
      const run = queue.shift()!;
      active++;
      void run().finally(() => {
        active--;
        pump();
      });
    }
  }
  function warmOne(uri: string | undefined): Promise<void> {
    if (!uri) return Promise.resolve();
    try {
      const url = new URL(uri);
      if (url.protocol !== 'https:' || url.username || url.password)
        return Promise.resolve();
    } catch {
      return Promise.resolve();
    }
    const cached = entries.get(uri);
    if (cached && cached.expires > now()) return cached.promise;
    if (queue.length >= 8) return Promise.resolve();
    let done!: () => void;
    const entry: Entry = {
      promise: new Promise<void>((resolve) => {
        done = resolve;
      }),
      expires: Infinity,
    };
    entries.set(uri, entry);
    queue.push(async () => {
      try {
        await load(uri);
        entry.expires = now() + 5 * 60_000;
      } catch {
        entries.delete(uri);
      } finally {
        while (entries.size > 128) {
          const old = [...entries].find(([, v]) => v.expires !== Infinity);
          if (!old) break;
          entries.delete(old[0]);
        }
        done();
      }
    });
    pump();
    return entry.promise;
  }
  return {
    warm: async (uris: readonly (string | undefined)[]) => {
      await Promise.all(uris.slice(0, 3).map(warmOne));
    },
  };
}
