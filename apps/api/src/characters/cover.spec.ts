import { expect, it, jest } from '@jest/globals';
import type { DatabaseService } from '../database.service';
import { characterCoverSigner } from './cover';
it('reuses signed covers without bypassing current private-bucket checks', async () => {
  const previous = process.env.SUPABASE_URL;
  process.env.SUPABASE_URL = 'https://storage.example.test';
  let publicBucket = false;
  const signed = jest.fn(async (path: string) => ({
    data: { signedUrl: `https://storage.example.test/${path}` },
    error: null,
  }));
  const getBucket = jest.fn(async () => ({
    data: { public: publicBucket },
    error: null,
  }));
  const database = {
    client: {
      storage: { getBucket, from: () => ({ createSignedUrl: signed }) },
    },
  } as unknown as DatabaseService;
  try {
    const first = await characterCoverSigner(database);
    await first('a.jpg');
    await first('b.jpg');
    const next = await characterCoverSigner(database);
    await next('a.jpg');
    expect(signed).toHaveBeenCalledTimes(2);
    expect(getBucket).toHaveBeenCalledTimes(2);
    publicBucket = true;
    await expect(characterCoverSigner(database)).rejects.toMatchObject({
      status: 503,
    });
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous;
  }
});
