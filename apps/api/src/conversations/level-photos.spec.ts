import { jest } from '@jest/globals';
import { LevelPhotosService } from './level-photos.service';
import type { DatabaseService } from '../database.service';
const originalUrl = process.env.SUPABASE_URL;
afterAll(() => {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
});
function fixture(
  options: {
    conversation?: boolean;
    photo?: boolean;
    approved?: boolean;
    unlocked?: boolean;
    publicBucket?: boolean;
    wrongOrigin?: boolean;
  } = {},
) {
  const records: Record<string, unknown> = {
    companion_conversations:
      options.conversation === false ? null : { character_id: 'character' },
    companion_photos:
      options.photo === false
        ? null
        : {
            id: 'photo',
            object_key: 'character/private.png',
            review_status: options.approved === false ? 'draft' : 'approved',
          },
    companion_photo_unlocks:
      options.unlocked === false ? null : { id: 'unlock' },
  };
  const filters: [string, string, unknown][] = [];
  const from = (table: string) => {
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push([table, column, value]);
        return chain;
      },
      maybeSingle: async () => ({ data: records[table], error: null }),
    };
    return chain;
  };
  process.env.SUPABASE_URL = 'https://storage.example.com';
  const sign = jest.fn(async () => ({
    data: {
      signedUrl:
        (options.wrongOrigin
          ? 'https://unexpected.example.com'
          : process.env.SUPABASE_URL) +
        '/storage/v1/object/sign/companion-photos/character/private.png?token=test',
    },
    error: null,
  }));
  const bucket = jest.fn(async () => ({
    data: { public: options.publicBucket ?? false },
    error: null,
  }));
  const service = new LevelPhotosService({
    client: {
      from,
      storage: { getBucket: bucket, from: () => ({ createSignedUrl: sign }) },
    },
  } as unknown as DatabaseService);
  return { service, sign, bucket, filters };
}
describe('private earned photo boundary', () => {
  it.each([
    { conversation: false },
    { photo: false },
    { approved: false },
    { unlocked: false },
  ])('does not sign an unavailable or unowned photo: %j', async (options) => {
    const f = fixture(options);
    await expect(
      f.service.access('actor', 'conversation', 'photo'),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('refuses a public storage bucket even for an earned photo', async () => {
    const f = fixture({ publicBucket: true });
    await expect(
      f.service.access('actor', 'conversation', 'photo'),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('scopes conversation, photo and entitlement before signing for 60 seconds', async () => {
    const f = fixture();
    const result = await f.service.access('actor', 'conversation', 'photo');
    expect(f.filters).toEqual(
      expect.arrayContaining([
        ['companion_conversations', 'user_id', 'actor'],
        ['companion_photos', 'character_id', 'character'],
        ['companion_photo_unlocks', 'user_id', 'actor'],
        ['companion_photo_unlocks', 'photo_id', 'photo'],
      ]),
    );
    expect(f.sign).toHaveBeenCalledWith('character/private.png', 60);
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'url']);
    expect(Date.parse(result.expiresAt) - Date.now()).toBeLessThanOrEqual(
      60000,
    );
  });
  it('rejects an unexpected signing origin', async () => {
    const f = fixture({ wrongOrigin: true });
    await expect(
      f.service.access('actor', 'conversation', 'photo'),
    ).rejects.toMatchObject({ status: 503 });
  });
});
