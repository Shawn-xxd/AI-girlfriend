import { describe, it, expect } from '@jest/globals';
import { generationIsPending } from './history';
describe('generation recovery', () => {
  it('uses the active generation lease rather than the original message age', () => {
    const now = Date.now();
    expect(
      generationIsPending(
        {
          state: 'pending',
          leaseExpiresAt: new Date(now + 90000).toISOString(),
        },
        now,
      ),
    ).toBe(true);
    expect(
      generationIsPending(
        { state: 'pending', leaseExpiresAt: new Date(now - 1).toISOString() },
        now,
      ),
    ).toBe(false);
    expect(
      generationIsPending(
        {
          state: 'completed',
          leaseExpiresAt: new Date(now + 90000).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });
});
