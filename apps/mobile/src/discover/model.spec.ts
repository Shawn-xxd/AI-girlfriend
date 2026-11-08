import { describe, expect, it } from '@jest/globals';
import { remainingCharacters, swipeIntent } from './model';
const rows = ['a', 'b', 'c'].map((id) => ({
  id,
  name: id,
  archetype: 'Test',
  bio: '',
  tags: [],
}));
describe('Discover queue and gestures', () => {
  it('skips only dismissed IDs and can restart without altering the source', () => {
    expect(
      remainingCharacters(rows, ['a', 'a', 'unknown']).map((r) => r.id),
    ).toEqual(['b', 'c']);
    expect(remainingCharacters(rows, ['a', 'b', 'c'])).toEqual([]);
    expect(remainingCharacters(rows, [])).toEqual(rows);
  });
  it('ignores taps, vertical scroll and reverse flicks', () => {
    for (const [x, y, v] of [
      [5, 0, 2],
      [80, 100, 2],
      [40, 0, -2],
    ])
      expect(swipeIntent(x!, y!, v!, 393)).toBe('cancel');
    expect(swipeIntent(NaN, 0, 0, 393)).toBe('cancel');
  });
  it('uses horizontal intent and accepts only deliberate selection or skip', () => {
    expect(swipeIntent(-100, 8, 0, 393)).toBe('skip');
    expect(swipeIntent(100, 8, 0, 393)).toBe('select');
    expect(swipeIntent(35, 0, 1, 393)).toBe('select');
  });
});
