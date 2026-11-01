export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface GuestIdentityStorage {
  getIdentity(): Promise<string | null>;
  rememberIdentity(userId: string): Promise<void>;
}

const userIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readIdentity(value: string): string {
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('version' in parsed) ||
    parsed.version !== 1 ||
    !('userId' in parsed) ||
    typeof parsed.userId !== 'string' ||
    !userIdPattern.test(parsed.userId)
  )
    throw new Error('Guest identity unavailable');
  return parsed.userId;
}

// Keep this non-credential marker separate from the SDK's removable session.
// Read/migrate before constructing the SDK, which may discard expired sessions.
export function createGuestIdentityStorage(
  storage: AuthStorage,
  sessionKey: string,
): GuestIdentityStorage {
  const markerKey = `${sessionKey}-identity`;
  const write = async (userId: string) => {
    if (!userIdPattern.test(userId))
      throw new Error('Guest identity unavailable');
    await storage.setItem(markerKey, JSON.stringify({ version: 1, userId }));
  };
  return {
    async getIdentity() {
      const marker = await storage.getItem(markerKey);
      if (marker !== null) return readIdentity(marker);
      const previous = await storage.getItem(sessionKey);
      if (previous === null) return null;
      const session: unknown = JSON.parse(previous);
      if (
        !session ||
        typeof session !== 'object' ||
        !('user' in session) ||
        !session.user ||
        typeof session.user !== 'object' ||
        !('id' in session.user) ||
        typeof session.user.id !== 'string'
      )
        throw new Error('Guest identity unavailable');
      await write(session.user.id);
      return session.user.id;
    },
    async rememberIdentity(userId) {
      const marker = await storage.getItem(markerKey);
      if (marker !== null) {
        if (readIdentity(marker) !== userId)
          throw new Error('Guest identity unavailable');
        return;
      }
      await write(userId);
    },
  };
}

interface Manifest {
  version: 1;
  generation: string;
  count: number;
}

function readManifest(value: string | null): Manifest | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as Partial<Manifest>;
  if (
    parsed.version !== 1 ||
    typeof parsed.generation !== 'string' ||
    !/^[a-z0-9-]+$/.test(parsed.generation) ||
    !Number.isInteger(parsed.count) ||
    !parsed.count ||
    parsed.count < 1 ||
    parsed.count > 256
  )
    throw new Error('Session storage unavailable');
  return parsed as Manifest;
}

// SecureStore can reject values above 2048 bytes. Each chunk is at most 1024
// UTF-8 bytes; commit the manifest last so failed writes retain the old session.
export function createChunkedAuthStorage(storage: AuthStorage): AuthStorage {
  const queues = new Map<string, Promise<unknown>>();
  let generation = 0;
  function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    queues.set(key, next);
    void next
      .finally(() => {
        if (queues.get(key) === next) queues.delete(key);
      })
      .catch(() => undefined);
    return next;
  }
  const prefix = (key: string) => `companion.guest.${key}`;
  const chunkKey = (key: string, manifest: Manifest, index: number) =>
    `${prefix(key)}.${manifest.generation}.${index}`;
  async function clean(key: string, manifest: Manifest | null) {
    if (!manifest) return;
    await Promise.allSettled(
      Array.from({ length: manifest.count }, (_, index) =>
        storage.removeItem(chunkKey(key, manifest, index)),
      ),
    );
  }
  return {
    getItem: (key) =>
      serialized(key, async () => {
        const manifest = readManifest(await storage.getItem(prefix(key)));
        if (!manifest) return null;
        const chunks = await Promise.all(
          Array.from({ length: manifest.count }, (_, index) =>
            storage.getItem(chunkKey(key, manifest, index)),
          ),
        );
        if (chunks.some((chunk) => chunk === null))
          throw new Error('Session storage unavailable');
        return chunks.join('');
      }),
    setItem: (key, value) =>
      serialized(key, async () => {
        const old = readManifest(await storage.getItem(prefix(key)));
        const points = Array.from(value);
        const count = Math.max(1, Math.ceil(points.length / 256));
        if (count > 256) throw new Error('Session storage unavailable');
        const manifest: Manifest = {
          version: 1,
          generation: `${Date.now().toString(36)}-${generation++}-${Math.random().toString(36).slice(2)}`,
          count,
        };
        try {
          for (let index = 0; index < count; index += 1)
            await storage.setItem(
              chunkKey(key, manifest, index),
              points.slice(index * 256, (index + 1) * 256).join(''),
            );
          await storage.setItem(prefix(key), JSON.stringify(manifest));
        } catch {
          await clean(key, manifest);
          throw new Error('Session storage unavailable');
        }
        await clean(key, old);
      }),
    removeItem: (key) =>
      serialized(key, async () => {
        const manifest = readManifest(await storage.getItem(prefix(key)));
        await storage.removeItem(prefix(key));
        await clean(key, manifest);
      }),
  };
}
