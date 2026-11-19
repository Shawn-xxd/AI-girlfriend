import { expect, it } from '@jest/globals';
import { createOnboardingStore } from './store-core';
import {
  createInitialDraft,
  serializeCheckpoint,
  type Pronouns,
} from './model';
const saved = serializeCheckpoint({
  step: 'offer',
  completed: true,
  draft: {
    ...createInitialDraft(),
    name: 'Before',
    pronouns: 'he',
    adultConfirmed: true,
    termsAccepted: true,
    interests: ['romance'],
  },
});
function storage(fail = false) {
  let value: string | null = saved;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => {
      if (fail) throw new Error('disk full');
      value = next;
    },
  };
}
it('edits a completed local profile without reopening onboarding or altering consent/preferences', async () => {
  const disk = storage();
  const store = createOnboardingStore(disk);
  await store.getState().hydrate();
  const before = store.getState().draft;
  expect(
    store.getState().updateProfile({ name: '  After  ', pronouns: 'they' }),
  ).toBe(true);
  await store.getState().flush();
  expect(store.getState()).toMatchObject({
    completed: true,
    step: 'offer',
    draft: { ...before, name: 'After', pronouns: 'they' },
  });
  const reopened = createOnboardingStore(disk);
  await reopened.getState().hydrate();
  expect(reopened.getState().draft.name).toBe('After');
  expect(reopened.getState().completed).toBe(true);
});
it('rejects invalid edits and does not bypass onboarding before completion', async () => {
  const store = createOnboardingStore(storage());
  await store.getState().hydrate();
  const before = store.getState().draft;
  for (const profile of [
    { name: ' ', pronouns: null },
    { name: 'x'.repeat(41), pronouns: null },
    { name: 'Valid', pronouns: 'invalid' as Pronouns },
  ])
    expect(store.getState().updateProfile(profile)).toBe(false);
  expect(store.getState().draft).toBe(before);
  store.getState().reset();
  expect(
    store.getState().updateProfile({ name: 'Bypass', pronouns: 'he' }),
  ).toBe(false);
  expect(store.getState().completed).toBe(false);
});
it('exposes local persistence failure so the screen does not report a saved edit', async () => {
  const store = createOnboardingStore(storage(true));
  await store.getState().hydrate();
  expect(
    store.getState().updateProfile({ name: 'After', pronouns: null }),
  ).toBe(true);
  await store.getState().flush();
  expect(store.getState().storageError).toBe('write');
});
