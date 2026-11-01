import { createStore } from 'zustand/vanilla';
import {
  FAVORITE_OPTIONS,
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  PRONOUN_OPTIONS,
  canContinueStep,
  createInitialCheckpoint,
  hasRequiredConsent,
  isValidName,
  limitNameInput,
  restoreCheckpoint,
  serializeCheckpoint,
  toggleSelection,
  type Favorite,
  type Goal,
  type Interest,
  type OnboardingCheckpoint,
  type OnboardingDraft,
  type Pronouns,
} from './model';

export interface OnboardingStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface OnboardingActions {
  hydrate(): Promise<void>;
  setName(name: string): void;
  setPronouns(pronouns: Pronouns | null): void;
  setAdultConfirmed(confirmed: boolean): void;
  setTermsAccepted(accepted: boolean): void;
  toggleInterest(interest: Interest): void;
  toggleFavorite(favorite: Favorite): void;
  toggleGoal(goal: Goal): void;
  next(): boolean;
  back(): boolean;
  finish(): boolean;
  reset(): void;
  flush(): Promise<void>;
}

export interface OnboardingState
  extends OnboardingCheckpoint,
    OnboardingActions {
  hydrated: boolean;
  storageError: 'read' | 'write' | null;
}

/** Injecting storage keeps the state machine testable without a native runtime. */
export function createOnboardingStore(storage: OnboardingStorage) {
  let hydration: Promise<void> | undefined;
  let restoring = true;
  let writes = Promise.resolve();

  const store = createStore<OnboardingState>()((set, get) => {
    const updateDraft = (change: Partial<OnboardingDraft>) => {
      if (!get().hydrated || get().completed) return;
      set((state) => ({ draft: { ...state.draft, ...change } }));
    };

    return {
      ...createInitialCheckpoint(),
      hydrated: false,
      storageError: null,
      hydrate() {
        if (hydration) return hydration;
        hydration = (async () => {
          try {
            const raw = await storage.getItem(ONBOARDING_STORAGE_KEY);
            if (raw !== null) {
              set(restoreCheckpoint(JSON.parse(raw) as unknown));
            }
          } catch {
            set({ ...createInitialCheckpoint(), storageError: 'read' });
          } finally {
            set({ hydrated: true });
            restoring = false;
          }
        })();
        return hydration;
      },
      setName(name) {
        updateDraft({ name: limitNameInput(name) });
      },
      setPronouns(pronouns) {
        if (
          pronouns === null ||
          PRONOUN_OPTIONS.some((option) => option.id === pronouns)
        ) {
          updateDraft({ pronouns });
        }
      },
      setAdultConfirmed(adultConfirmed) {
        updateDraft({ adultConfirmed: adultConfirmed === true });
      },
      setTermsAccepted(termsAccepted) {
        updateDraft({ termsAccepted: termsAccepted === true });
      },
      toggleInterest(interest) {
        if (INTEREST_OPTIONS.some((option) => option.id === interest)) {
          updateDraft({
            interests: toggleSelection(get().draft.interests, interest),
          });
        }
      },
      toggleFavorite(favorite) {
        if (FAVORITE_OPTIONS.some((option) => option.id === favorite)) {
          updateDraft({
            favorites: toggleSelection(get().draft.favorites, favorite),
          });
        }
      },
      toggleGoal(goal) {
        if (GOAL_OPTIONS.some((option) => option.id === goal)) {
          updateDraft({ goals: toggleSelection(get().draft.goals, goal) });
        }
      },
      next() {
        const state = get();
        if (!state.hydrated || state.completed || state.step === 'offer')
          return false;
        if (!canContinueStep(state.step, state.draft)) return false;
        const nextStep =
          ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(state.step) + 1];
        if (!nextStep) return false;
        set({
          step: nextStep,
          ...(state.step === 'profile'
            ? { draft: { ...state.draft, name: state.draft.name.trim() } }
            : {}),
        });
        return true;
      },
      back() {
        const state = get();
        if (!state.hydrated || state.completed) return false;
        const index = ONBOARDING_STEPS.indexOf(state.step);
        if (index <= 1) return false;
        const previousStep = ONBOARDING_STEPS[index - 1];
        if (!previousStep) return false;
        set({ step: previousStep });
        return true;
      },
      finish() {
        const state = get();
        if (
          !state.hydrated ||
          state.completed ||
          state.step !== 'offer' ||
          !hasRequiredConsent(state.draft) ||
          !isValidName(state.draft.name)
        ) {
          return false;
        }
        set({
          completed: true,
          draft: { ...state.draft, name: state.draft.name.trim() },
        });
        return true;
      },
      reset() {
        if (get().hydrated) set(createInitialCheckpoint());
      },
      async flush() {
        await writes;
      },
    };
  });

  store.subscribe((state, previous) => {
    if (
      restoring ||
      !state.hydrated ||
      (state.step === previous.step &&
        state.completed === previous.completed &&
        state.draft === previous.draft)
    ) {
      return;
    }
    const serialized = serializeCheckpoint(state);
    // AsyncStorage writes must retain order when several selections change quickly.
    writes = writes.then(async () => {
      try {
        await storage.setItem(ONBOARDING_STORAGE_KEY, serialized);
        store.setState({ storageError: null });
      } catch {
        store.setState({ storageError: 'write' });
      }
    });
  });

  return store;
}
