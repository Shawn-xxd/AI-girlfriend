import { describe, expect, it } from '@jest/globals';
import {
  MAX_NAME_INPUT_LENGTH,
  MAX_NAME_LENGTH,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_STORAGE_VERSION,
  createInitialDraft,
  type OnboardingStep,
} from './model';
import { createOnboardingStore, type OnboardingStorage } from './store-core';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  const writes: string[] = [];
  return {
    writes,
    read: () => value,
    getItem: async () => value,
    setItem: async (key: string, next: string) => {
      expect(key).toBe(ONBOARDING_STORAGE_KEY);
      writes.push(next);
      value = next;
    },
  };
}

type Store = ReturnType<typeof createOnboardingStore>;

function advanceTo(store: Store, target: OnboardingStep) {
  for (
    let index = 0;
    index < 12 && store.getState().step !== target;
    index += 1
  ) {
    expect(store.getState().next()).toBe(true);
  }
  expect(store.getState().step).toBe(target);
}

function acceptWelcome(store: Store) {
  advanceTo(store, 'welcome');
  store.getState().setAdultConfirmed(true);
  store.getState().setTermsAccepted(true);
}

function savedState(overrides: Record<string, unknown> = {}, version = 1) {
  return JSON.stringify({
    version,
    state: {
      step: 'interests',
      completed: false,
      draft: {
        ...createInitialDraft(),
        name: 'Alex',
        adultConfirmed: true,
        termsAccepted: true,
      },
      ...overrides,
    },
  });
}

describe('device onboarding flow', () => {
  it('waits for hydration and requires explicit adult and terms confirmation', async () => {
    const storage = memoryStorage();
    const store = createOnboardingStore(storage);
    expect(store.getState().next()).toBe(false);
    store.getState().setAdultConfirmed(true);
    expect(store.getState().draft.adultConfirmed).toBe(false);

    await store.getState().hydrate();
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().next()).toBe(true);
    expect(store.getState().step).toBe('welcome');
    expect(store.getState().next()).toBe(false);
    store.getState().setTermsAccepted(true);
    expect(store.getState().next()).toBe(false);
    store.getState().setAdultConfirmed(true);
    expect(store.getState().next()).toBe(true);
    expect(store.getState().step).toBe('role-play');
    expect(store.getState().finish()).toBe(false);
    await store.getState().flush();
  });

  it('validates a trimmed Unicode name and leaves pronouns optional', async () => {
    const store = createOnboardingStore(memoryStorage());
    await store.getState().hydrate();
    acceptWelcome(store);
    advanceTo(store, 'profile');

    for (const name of ['', '   ', 'A'.repeat(MAX_NAME_LENGTH + 1)]) {
      store.getState().setName(name);
      expect(store.getState().next()).toBe(false);
    }
    store.getState().setName('🦋'.repeat(MAX_NAME_LENGTH));
    expect(store.getState().next()).toBe(true);
    expect(store.getState().back()).toBe(true);
    store.getState().setName('  Alex  ');
    expect(store.getState().next()).toBe(true);
    expect(store.getState().draft.name).toBe('Alex');
    expect(store.getState().draft.pronouns).toBeNull();

    store.getState().setName(`\u0000${'A'.repeat(10_000)}`);
    expect(Array.from(store.getState().draft.name)).toHaveLength(
      MAX_NAME_INPUT_LENGTH,
    );
    expect(store.getState().draft.name).not.toContain('\u0000');
    await store.getState().flush();
  });

  it('keeps unique selections when going back and lets optional questions be skipped', async () => {
    const store = createOnboardingStore(memoryStorage());
    await store.getState().hydrate();
    acceptWelcome(store);
    store.getState().setName('Alex');
    advanceTo(store, 'interests');
    store.getState().toggleInterest('romance');
    store.getState().toggleInterest('friend');
    store.getState().toggleInterest('romance');
    store.getState().toggleInterest('romance');
    expect(store.getState().draft.interests).toEqual(['friend', 'romance']);
    store.getState().next();
    store.getState().back();
    expect(store.getState().draft.interests).toEqual(['friend', 'romance']);
    advanceTo(store, 'offer');
    expect(store.getState().draft.favorites).toEqual([]);
    expect(store.getState().draft.goals).toEqual([]);
    expect(store.getState().completed).toBe(false);
    expect(store.getState().finish()).toBe(true);
    expect(store.getState().completed).toBe(true);
    expect(store.getState().back()).toBe(false);
    expect(store.getState().finish()).toBe(false);
    await store.getState().flush();
  });

  it('restores a draft with the same step, profile, and optional selections', async () => {
    const storage = memoryStorage();
    const store = createOnboardingStore(storage);
    await store.getState().hydrate();
    acceptWelcome(store);
    store.getState().setName('Alex');
    store.getState().setPronouns('they');
    advanceTo(store, 'favorites');
    store.getState().toggleInterest('adventure');
    store.getState().toggleFavorite('just-chatting');
    store.getState().toggleGoal('connections');
    await store.getState().flush();

    const restarted = createOnboardingStore(storage);
    await restarted.getState().hydrate();
    expect(restarted.getState().step).toBe('favorites');
    expect(restarted.getState().completed).toBe(false);
    expect(restarted.getState().draft).toEqual(store.getState().draft);
    expect(restarted.getState().draft.pronouns).toBe('they');
  });

  it('restores completion without creating authentication or subscription rights', async () => {
    const storage = memoryStorage();
    const store = createOnboardingStore(storage);
    await store.getState().hydrate();
    acceptWelcome(store);
    store.getState().setName('Alex');
    advanceTo(store, 'offer');
    expect(store.getState().next()).toBe(false);
    expect(store.getState().finish()).toBe(true);
    await store.getState().flush();

    const record = JSON.parse(storage.read() ?? '') as {
      state: Record<string, unknown>;
    };
    expect(Object.keys(record.state).sort()).toEqual([
      'completed',
      'draft',
      'step',
    ]);
    const restarted = createOnboardingStore(storage);
    await restarted.getState().hydrate();
    expect(restarted.getState().completed).toBe(true);
    expect(restarted.getState().step).toBe('offer');
    restarted.getState().reset();
    expect(restarted.getState().completed).toBe(false);
    expect(restarted.getState().draft).toEqual(createInitialDraft());
    await restarted.getState().flush();
    const resetRestart = createOnboardingStore(storage);
    await resetRestart.getState().hydrate();
    expect(resetRestart.getState().completed).toBe(false);
  });
});

describe('onboarding persistence recovery', () => {
  it.each([
    ['broken JSON', '{broken'],
    ['missing envelope', JSON.stringify({ completed: true })],
    ['missing draft', savedState({ draft: null })],
    ['future format', savedState({}, ONBOARDING_STORAGE_VERSION + 1)],
  ])(
    'starts safely after %s and releases the hydration gate',
    async (_label, raw) => {
      const store = createOnboardingStore(memoryStorage(raw));
      await store.getState().hydrate();
      expect(store.getState().hydrated).toBe(true);
      expect(store.getState().completed).toBe(false);
      expect(store.getState().step).toBe('splash');
      expect(store.getState().draft).toEqual(createInitialDraft());
    },
  );

  it('preserves safe old preferences but asks for adult consent and terms again', async () => {
    const store = createOnboardingStore(
      memoryStorage(savedState({ completed: true }, 0)),
    );
    await store.getState().hydrate();
    expect(store.getState().step).toBe('welcome');
    expect(store.getState().draft.name).toBe('Alex');
    expect(store.getState().draft.adultConfirmed).toBe(false);
    expect(store.getState().draft.termsAccepted).toBe(false);
    expect(store.getState().completed).toBe(false);
    expect(store.getState().next()).toBe(false);
  });

  it('rejects damaged consent, names, duplicates, and unknown preference values', async () => {
    const store = createOnboardingStore(
      memoryStorage(
        savedState({
          step: 'offer',
          completed: true,
          draft: {
            ...createInitialDraft(),
            name: 'Alex',
            adultConfirmed: 'true',
            termsAccepted: true,
            pronouns: 'unknown',
            interests: ['friend', 'friend', 'unknown', 1],
            favorites: ['just-chatting', 'just-chatting'],
            goals: ['connections', null],
            accessToken: 'never-retain',
            premium: true,
          },
        }),
      ),
    );
    await store.getState().hydrate();
    expect(store.getState().completed).toBe(false);
    expect(store.getState().step).toBe('welcome');
    expect(store.getState().draft.pronouns).toBeNull();
    expect(store.getState().draft.interests).toEqual(['friend']);
    expect(store.getState().draft.favorites).toEqual(['just-chatting']);
    expect(store.getState().draft.goals).toEqual(['connections']);
    expect(store.getState().draft).not.toHaveProperty('accessToken');
    expect(store.getState().draft).not.toHaveProperty('premium');

    const missingName = createOnboardingStore(
      memoryStorage(
        savedState({
          step: 'offer',
          completed: true,
          draft: {
            ...createInitialDraft(),
            adultConfirmed: true,
            termsAccepted: true,
          },
        }),
      ),
    );
    await missingName.getState().hydrate();
    expect(missingName.getState().completed).toBe(false);
    expect(missingName.getState().step).toBe('profile');
  });

  it('deduplicates concurrent hydration and does not overwrite a pending read', async () => {
    let resolveRead: (raw: string | null) => void = () => undefined;
    const writes: string[] = [];
    let reads = 0;
    const storage: OnboardingStorage = {
      getItem: () => {
        reads += 1;
        return new Promise((resolve) => {
          resolveRead = resolve;
        });
      },
      setItem: async (_key, raw) => {
        writes.push(raw);
      },
    };
    const store = createOnboardingStore(storage);
    const first = store.getState().hydrate();
    const second = store.getState().hydrate();
    store.getState().setName('Overwrite');
    store.getState().reset();
    expect(writes).toEqual([]);
    resolveRead(savedState());
    await Promise.all([first, second]);
    expect(reads).toBe(1);
    expect(store.getState().draft.name).toBe('Alex');
    expect(writes).toEqual([]);
  });

  it('serializes rapid changes and recovers on a later write after a storage failure', async () => {
    const writtenNames: string[] = [];
    let activeWrites = 0;
    let failNext = true;
    const storage: OnboardingStorage = {
      getItem: async () => null,
      setItem: async (_key, raw) => {
        activeWrites += 1;
        expect(activeWrites).toBe(1);
        await Promise.resolve();
        activeWrites -= 1;
        if (failNext) {
          failNext = false;
          throw new Error('Device storage unavailable');
        }
        const data = JSON.parse(raw) as { state: { draft: { name: string } } };
        writtenNames.push(data.state.draft.name);
      },
    };
    const store = createOnboardingStore(storage);
    await store.getState().hydrate();
    store.getState().setName('First');
    await store.getState().flush();
    expect(store.getState().storageError).toBe('write');
    store.getState().setName('Second');
    store.getState().setName('Third');
    await store.getState().flush();
    expect(writtenNames).toEqual(['Second', 'Third']);
    expect(store.getState().storageError).toBeNull();
  });

  it('allows the current session to proceed if device storage cannot be read', async () => {
    const store = createOnboardingStore({
      getItem: async () => {
        throw new Error('Unavailable');
      },
      setItem: async () => undefined,
    });
    await store.getState().hydrate();
    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().storageError).toBe('read');
    expect(store.getState().next()).toBe(true);
    await store.getState().flush();
    expect(store.getState().storageError).toBeNull();
  });
});
