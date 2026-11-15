import {
  adminCharacterInput,
  adminLevelsInput,
  adminPhotoInput,
} from './admin';
const id = '10000000-0000-4000-8000-000000000001';
it('does not accept forged actor or role fields in content updates', () => {
  expect(
    adminCharacterInput.safeParse({
      id,
      revision: null,
      name: 'A',
      archetype: 'A',
      bio: '',
      tags: [],
      system_prompt: '',
      cover_object_key: null,
      published: false,
      actor_id: id,
    }).success,
  ).toBe(false);
});
it('rejects skipped/decreasing levels without inventing thresholds', () => {
  for (const rules of [
    [{ level: 2, requiredCount: 0 }],
    [
      { level: 1, requiredCount: 0 },
      { level: 2, requiredCount: 0 },
    ],
  ])
    expect(
      adminLevelsInput.safeParse({ character_id: id, revision: null, rules })
        .success,
    ).toBe(false);
});
it('keeps unpriced diamond photos as drafts and blocks publishing them', () => {
  const p = {
    id,
    revision: null,
    character_id: id,
    title: 'Photo',
    kind: 'diamond',
    required_level: null,
    diamond_price: null,
    object_key: `admin/${id}/${id}.png`,
    review_status: 'approved',
    published: false,
  };
  expect(adminPhotoInput.safeParse(p).success).toBe(true);
  expect(adminPhotoInput.safeParse({ ...p, published: true }).success).toBe(
    false,
  );
});
it('requires review approval before photos can be published', () => {
  expect(
    adminPhotoInput.safeParse({
      id,
      revision: null,
      character_id: id,
      title: 'P',
      kind: 'level',
      required_level: 1,
      diamond_price: null,
      object_key: `admin/${id}/${id}.png`,
      review_status: 'draft',
      published: true,
    }).success,
  ).toBe(false);
});
