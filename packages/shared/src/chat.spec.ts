import { messagePageQuerySchema, sendMessageSchema } from './index';
describe('chat request contract', () => {
  it('rejects client attempts to supply a user identity', () => {
    expect(
      sendMessageSchema.safeParse({
        requestKey: '00000000-0000-4000-8000-000000000001',
        text: 'Hello',
        userId: 'other',
      }).success,
    ).toBe(false);
  });
  it('rejects invalid and unbounded history pagination', () => {
    for (const query of [
      { before: '-1' },
      { limit: '9999' },
      { before: 'invalid' },
    ])
      expect(messagePageQuerySchema.safeParse(query).success).toBe(false);
  });
  it('requires a stable UUID request key and nonempty text', () => {
    expect(
      sendMessageSchema.safeParse({ requestKey: 'invalid', text: 'Hello' })
        .success,
    ).toBe(false);
    expect(
      sendMessageSchema.safeParse({
        requestKey: '00000000-0000-4000-8000-000000000001',
        text: '  ',
      }).success,
    ).toBe(false);
  });
});
