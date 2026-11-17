import { ServiceUnavailableException } from '@nestjs/common';
import type { DatabaseService } from '../database.service';
const bucket = 'companion-photos';
const caches = new WeakMap<
  DatabaseService,
  Map<string, { url: string; expires: number }>
>();

// Validate the bucket once per response; reuse signed URLs while comfortably inside their lifetime.
export async function characterCoverSigner(database: DatabaseService) {
  const state = await database.client.storage.getBucket(bucket);
  if (state.error || !state.data || state.data.public)
    throw new ServiceUnavailableException('Character cover unavailable');
  let cache = caches.get(database);
  if (!cache) {
    cache = new Map();
    caches.set(database, cache);
  }
  const urls = cache;
  return async (path: string) => {
    const previous = urls.get(path);
    if (previous && previous.expires > Date.now()) return previous.url;
    const signed = await database.client.storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    if (signed.error || !signed.data)
      throw new ServiceUnavailableException('Character cover unavailable');
    try {
      const url = new URL(signed.data.signedUrl);
      if (
        url.origin !== new URL(process.env.SUPABASE_URL!).origin ||
        url.protocol !== 'https:'
      )
        throw new Error();
      urls.set(path, {
        url: url.toString(),
        expires: Date.now() + 45 * 60_000,
      });
      if (urls.size > 256) urls.delete(urls.keys().next().value!);
      return url.toString();
    } catch {
      throw new ServiceUnavailableException('Character cover unavailable');
    }
  };
}
export async function signedCharacterCover(
  database: DatabaseService,
  path: string,
) {
  return (await characterCoverSigner(database))(path);
}
