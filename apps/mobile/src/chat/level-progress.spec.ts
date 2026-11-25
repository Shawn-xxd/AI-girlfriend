import { expect, it } from '@jest/globals';
import { characterProgressSchema } from '@companion/shared';
import { levelProgress } from './level-progress';

it('uses the current level interval for nonuniform thresholds and resets on level-up', () => {
  const base = {
    level: 2,
    currentLevelRequiredCount: 5,
    nextLevel: { level: 3, requiredCount: 17 },
  };
  expect(levelProgress({ ...base, effectiveChatCount: 5 }).fraction).toBe(0);
  expect(
    levelProgress({ ...base, effectiveChatCount: 9 }).fraction,
  ).toBeCloseTo(1 / 3);
  expect(levelProgress({ ...base, effectiveChatCount: 17 }).fraction).toBe(1);
  expect(
    levelProgress({
      level: 3,
      currentLevelRequiredCount: 17,
      effectiveChatCount: 17,
      nextLevel: { level: 4, requiredCount: 40 },
    }).fraction,
  ).toBe(0);
});

it('preserves an earned level when thresholds increase without rendering a negative or overflowing ring', () => {
  const base = {
    level: 2,
    currentLevelRequiredCount: 10,
    nextLevel: { level: 3, requiredCount: 20 },
  };
  expect(levelProgress({ ...base, effectiveChatCount: 5 }).fraction).toBe(0);
  expect(levelProgress({ ...base, effectiveChatCount: 100 }).fraction).toBe(1);
});

it('handles maximum levels and legacy cached progress without inventing a level interval', () => {
  expect(levelProgress(undefined).fraction).toBe(0);
  expect(
    levelProgress({ level: 1, effectiveChatCount: 9, nextLevel: null })
      .fraction,
  ).toBe(0);
  expect(
    levelProgress({
      level: 20,
      effectiveChatCount: 95,
      currentLevelRequiredCount: 95,
      nextLevel: null,
    }).fraction,
  ).toBe(1);
  const legacy = characterProgressSchema.parse({
    level: 1,
    effectiveChatCount: 2,
    nextLevel: { level: 2, requiredCount: 5 },
  });
  expect(levelProgress(legacy).fraction).toBe(0.4);
  expect(levelProgress({ ...legacy, level: 2 }).fraction).toBe(0);
  expect(
    characterProgressSchema.parse({ ...legacy, currentLevelRequiredCount: 0 })
      .currentLevelRequiredCount,
  ).toBe(0);
  expect(
    characterProgressSchema.safeParse({
      ...legacy,
      currentLevelRequiredCount: -1,
    }).success,
  ).toBe(false);
});
