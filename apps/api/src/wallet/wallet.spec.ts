import { jest } from '@jest/globals';
import { walletSchema, unlockDiamondPhotoSchema } from '@companion/shared';
import { walletResult, WalletService } from './wallet.service';
import type { DatabaseService } from '../database.service';
it.each([
  ['PT402', 402],
  ['PT409', 409],
  ['23505', 409],
  ['P0002', 404],
  ['PT400', 400],
  ['unexpected', 503],
])('maps %s without leaking database details', (code, status) => {
  expect(() =>
    walletResult(walletSchema, { data: null, error: { code: String(code) } }),
  ).toThrow(expect.objectContaining({ status }));
});
it('rejects invalid or overflowing wallet responses', () => {
  for (const value of [
    { availableDiamonds: -1, pendingRecovery: 0 },
    { availableDiamonds: 9000000000001, pendingRecovery: 0 },
    null,
  ])
    expect(() =>
      walletResult(walletSchema, { data: value, error: null }),
    ).toThrow(expect.objectContaining({ status: 503 }));
});
it('forwards only the verified actor and accepted unlock payload to one RPC', async () => {
  const rpc = jest.fn(async () => ({
    data: {
      photoId: '00000000-0000-4000-8000-000000000001',
      chargedDiamonds: 7,
      wallet: { availableDiamonds: 3, pendingRecovery: 0 },
    },
    error: null,
  }));
  const wallet = new WalletService({
    client: { rpc },
  } as unknown as DatabaseService);
  await wallet.unlock('verified-actor', 'owned-conversation', 'photo', {
    requestKey: 'stable-key',
    expectedPrice: 7,
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('companion_unlock_diamond_photo_v1', {
    p_actor: 'verified-actor',
    p_conversation: 'owned-conversation',
    p_photo: 'photo',
    p_key: 'stable-key',
    p_expected_price: 7,
  });
});
it('does not accept client amounts, owner IDs, or non-integer prices', () => {
  const body = {
    requestKey: '00000000-0000-4000-8000-000000000001',
    expectedPrice: 7,
  };
  expect(unlockDiamondPhotoSchema.safeParse(body).success).toBe(true);
  for (const value of [
    { ...body, actor: 'other' },
    { ...body, amount: 7 },
    { ...body, expectedPrice: 0 },
    { ...body, expectedPrice: 1.5 },
  ])
    expect(unlockDiamondPhotoSchema.safeParse(value).success).toBe(false);
});
