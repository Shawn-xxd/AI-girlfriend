import { expect, it, jest } from '@jest/globals';
import { createPreviewCache } from './preview-cache';
it('deduplicates image signing and scopes cached previews to the session token', async () => {
  const load = jest.fn(async () => ({ url: 'https://images.example/preview' }));
  const cache = createPreviewCache(load);
  await Promise.all([
    cache.get('session-a', 'cover'),
    cache.get('session-a', 'cover'),
  ]);
  expect(load).toHaveBeenCalledTimes(1);
  await cache.get('session-b', 'cover');
  expect(load).toHaveBeenCalledTimes(2);
  cache.remove('session-a', 'cover');
  await cache.get('session-a', 'cover');
  expect(load).toHaveBeenCalledTimes(3);
  cache.clear();
  await cache.get('session-b', 'cover');
  expect(load).toHaveBeenCalledTimes(4);
});
