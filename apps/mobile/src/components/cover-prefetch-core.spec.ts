import { expect, it, jest } from '@jest/globals';
import { createCoverPrefetcher } from './cover-prefetch-core';
it('deduplicates cover downloads across avatar/background and retries changed or failed URLs', async () => {
  let clock = 0;
  const load = jest.fn(async () => true);
  const cache = createCoverPrefetcher(load, () => clock);
  await Promise.all([
    cache.warm(['https://example.test/cover-v1']),
    cache.warm(['https://example.test/cover-v1']),
  ]);
  expect(load).toHaveBeenCalledTimes(1);
  await cache.warm(['https://example.test/cover-v2']);
  expect(load).toHaveBeenCalledTimes(2);
  clock = 300001;
  await cache.warm(['https://example.test/cover-v1']);
  expect(load).toHaveBeenCalledTimes(3);
  load.mockRejectedValueOnce(new Error('network'));
  await cache.warm(['https://example.test/fail']);
  await cache.warm(['https://example.test/fail']);
  expect(load).toHaveBeenCalledTimes(5);
});
it('limits background concurrency and rejects invalid remote sources', async () => {
  const completes: (() => void)[] = [];
  const load = jest.fn(
    () => new Promise<void>((resolve) => completes.push(resolve)),
  );
  const cache = createCoverPrefetcher(load);
  const job = cache.warm([
    'https://example.test/1',
    'https://example.test/2',
    'https://example.test/3',
  ]);
  expect(load).toHaveBeenCalledTimes(2);
  completes.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(load).toHaveBeenCalledTimes(3);
  completes.splice(0).forEach((resolve) => resolve());
  await job;
  await cache.warm([
    'http://example.test/no',
    'https://user:secret@example.test/no',
    'not-a-url',
  ]);
  expect(load).toHaveBeenCalledTimes(3);
});
