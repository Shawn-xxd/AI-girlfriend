import type { Character } from '@companion/shared';

export function characterCover(
  character: Pick<Character, 'id' | 'coverUrl'> | undefined,
  catalog: readonly Character[] | undefined,
): string | undefined {
  if (!character) return undefined;
  const current = catalog?.find((item) => item.id === character.id);
  return current ? current.coverUrl : character.coverUrl;
}

export function characterAvatarFocus(
  character: Pick<Character, 'id' | 'avatarFocusY'> | undefined,
  catalog: readonly Character[] | undefined,
): number {
  return (
    catalog?.find((item) => item.id === character?.id)?.avatarFocusY ??
    character?.avatarFocusY ??
    0.2
  );
}
