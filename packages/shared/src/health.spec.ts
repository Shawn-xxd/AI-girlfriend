import { healthResponseSchema } from './index';
describe('health API contract', () => {
  it('accepts the documented response', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({
      status: 'ok',
    });
  });
  it('rejects an unexpected service state', () => {
    expect(healthResponseSchema.safeParse({ status: 'failed' }).success).toBe(
      false,
    );
  });
});
