export function createPreviewCache(
  load: (token: string, path: string) => Promise<{ url: string }>,
) {
  const entries = new Map<
    string,
    { expires: number; promise: Promise<{ url: string }> }
  >();
  const key = (token: string, path: string) => `${token}:${path}`;
  return {
    get(token: string, path: string) {
      const id = key(token, path);
      const previous = entries.get(id);
      if (previous && previous.expires > Date.now()) return previous.promise;
      const promise = load(token, path).catch((error) => {
        entries.delete(id);
        throw error;
      });
      entries.set(id, { expires: Date.now() + 240_000, promise });
      if (entries.size > 256) entries.delete(entries.keys().next().value!);
      return promise;
    },
    remove(token: string, path: string) {
      entries.delete(key(token, path));
    },
    clear() {
      entries.clear();
    },
  };
}
