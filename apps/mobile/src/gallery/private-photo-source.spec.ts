import { expect, it } from '@jest/globals';
import {
  canReusePrivatePhoto,
  privatePhotoSource,
} from './private-photo-source';
const storage = 'https://example.supabase.co';
const path = `${storage}/storage/v1/object/sign/companion-photos/character/photo.webp`;
const source = (url: string, owner = 'a', photo = 'p') =>
  privatePhotoSource(owner, photo, url, storage);

it('reuses the same file after signing-token renewal without persisting the token', () => {
  const first = source(`${path}?token=old-secret`)!;
  const renewed = source(`${path}?token=new-secret`)!;
  expect(first.cacheKey).toBe(renewed.cacheKey);
  expect(first.cacheKey).not.toContain('secret');
  expect(renewed.uri).toBe(`${path}?token=new-secret`);
});
it('isolates owners, photos, replacement objects and byte variants', () => {
  const first = source(`${path}?token=one`)!;
  expect(source(`${path}?token=one`, 'b')!.cacheKey).not.toBe(first.cacheKey);
  expect(source(`${path}?token=one`, 'a', 'q')!.cacheKey).not.toBe(
    first.cacheKey,
  );
  expect(
    source(`${path.replace('photo.webp', 'replacement.webp')}?token=one`)!
      .cacheKey,
  ).not.toBe(first.cacheKey);
  expect(source(`${path}?width=200&token=one`)!.cacheKey).not.toBe(
    first.cacheKey,
  );
  expect(source(`${path}?width=200&height=300&token=one`)!.cacheKey).toBe(
    source(`${path}?token=two&height=300&width=200`)!.cacheKey,
  );
});
it('rejects foreign, public, credentialed, malformed and unsigned sources', () => {
  for (const uri of [
    path,
    `${path}?token=`,
    `${path}?token=x#fragment`,
    'file:///tmp/photo',
    `${path}?token=x`.replace('https:', 'http:'),
    `${path}?token=x`.replace('example.supabase.co', 'foreign.supabase.co'),
    `${path}?token=x`.replace('https://', 'https://user:password@'),
    `${path}?token=x`.replace('/sign/', '/public/'),
  ])
    expect(source(uri)).toBeUndefined();
  expect(
    privatePhotoSource('a', 'p', `${path}?token=x`, undefined),
  ).toBeUndefined();
});
it('never treats a cache pointer as a grant; only temporary errors allow reuse', () => {
  expect(canReusePrivatePhoto(true, true, true)).toBe(true);
  expect(canReusePrivatePhoto(true, true, true, 'unavailable')).toBe(true);
  expect(canReusePrivatePhoto(false, true, true)).toBe(false);
  expect(canReusePrivatePhoto(true, false, true)).toBe(false);
  expect(canReusePrivatePhoto(true, true, false)).toBe(false);
  for (const code of [
    'unauthorized',
    'not_found',
    'invalid_response',
    'unknown',
  ])
    expect(canReusePrivatePhoto(true, true, true, code)).toBe(false);
});
