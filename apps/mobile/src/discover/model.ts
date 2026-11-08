import type { CharacterList } from '@companion/shared';
export type DiscoverCharacter = CharacterList['characters'][number] & {
  portraitIndex?: number;
};
export function remainingCharacters(
  characters: readonly DiscoverCharacter[],
  dismissed: readonly string[],
) {
  const seen = new Set(dismissed);
  return characters.filter((character) => !seen.has(character.id));
}
export function swipeIntent(
  dx: number,
  dy: number,
  velocity: number,
  width: number,
): 'skip' | 'select' | 'cancel' {
  if (
    ![dx, dy, velocity, width].every(Number.isFinite) ||
    width <= 0 ||
    Math.abs(dx) <= Math.abs(dy) * 1.25
  )
    return 'cancel';
  if (
    Math.abs(dx) < Math.max(64, width * 0.22) &&
    !(
      Math.abs(dx) > 24 &&
      Math.abs(velocity) > 0.8 &&
      Math.sign(velocity) === Math.sign(dx)
    )
  )
    return 'cancel';
  return dx < 0 ? 'skip' : 'select';
}
