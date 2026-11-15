import { ServiceUnavailableException } from '@nestjs/common';
import type { DatabaseService } from '../database.service';
export async function signedCharacterCover(
  database: DatabaseService,
  path: string,
) {
  const bucket = 'companion-photos';
  const state = await database.client.storage.getBucket(bucket);
  if (state.error || !state.data || state.data.public)
    throw new ServiceUnavailableException('Character cover unavailable');
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
    return url.toString();
  } catch {
    throw new ServiceUnavailableException('Character cover unavailable');
  }
}
