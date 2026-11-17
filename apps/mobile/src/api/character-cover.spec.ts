import type { Character } from '@companion/shared';
import { characterCover } from './character-cover';
const mei: Character = {
  id: 'mei',
  name: 'Mei',
  archetype: '',
  bio: '',
  tags: [],
  coverUrl: 'https://images.example/mei-new.jpg',
};
it('uses the current cover for the same character even when conversation data has no cover', () => {
  expect(characterCover({ id: 'mei' }, [mei])).toBe(mei.coverUrl);
  expect(characterCover({ id: 'ava' }, [mei])).toBeUndefined();
});
it('clears an old cover when the current character no longer has one', () => {
  expect(
    characterCover({ id: 'mei', coverUrl: 'https://images.example/old.jpg' }, [
      { ...mei, coverUrl: undefined },
    ]),
  ).toBeUndefined();
});
it('preserves a conversation-provided cover while the catalog is unavailable', () => {
  expect(characterCover(mei, undefined)).toBe(mei.coverUrl);
  expect(characterCover(undefined, [mei])).toBeUndefined();
});
