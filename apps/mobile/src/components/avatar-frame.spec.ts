import { expect, it } from '@jest/globals';
import { avatarFrame } from './avatar-frame';
it('biases a tall portrait toward the upper part and keeps the whole frame covered', () => {
  expect(avatarFrame(60, 60, 100, 200, 0.2)).toEqual({
    width: 60,
    height: 120,
    left: 0,
    top: -12,
  });
  expect(avatarFrame(60, 60, 100, 200, 0)).toMatchObject({ top: 0 });
  expect(avatarFrame(60, 60, 100, 200, 1)).toMatchObject({ top: -60 });
});
it('centres horizontal cropping and rejects missing image dimensions', () => {
  expect(avatarFrame(60, 60, 200, 100, 0.2)).toEqual({
    width: 120,
    height: 60,
    left: -30,
    top: 0,
  });
  expect(avatarFrame(0, 60, 100, 100)).toBeNull();
});
