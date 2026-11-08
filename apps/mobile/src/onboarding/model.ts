export const ONBOARDING_STEPS = [
  'splash',
  'welcome',
  'role-play',
  'characters',
  'privacy',
  'meet',
  'profile',
  'interests',
  'favorites',
  'goals',
  'match',
  'offer',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const PRONOUN_OPTIONS = [
  { id: 'he', label: 'He' },
  { id: 'she', label: 'She' },
  { id: 'they', label: 'They' },
] as const;

export const INTEREST_OPTIONS = [
  { id: 'friend', label: 'Friend', emoji: '🤝' },
  { id: 'romance', label: 'Romance', emoji: '🌹' },
  { id: 'playful', label: 'Spicy', emoji: '🌶️' },
  { id: 'flirty', label: 'Flirty', emoji: '💦' },
  { id: 'love', label: 'Love', emoji: '❤️' },
  { id: 'relaxed', label: 'Rough', emoji: '⛓️' },
  { id: 'drama', label: 'Drama', emoji: '💔' },
  { id: 'life-like', label: 'Lifelike', emoji: '😜' },
  { id: 'adventure', label: 'Action', emoji: '🔥' },
  { id: 'sweet', label: 'Sweet', emoji: '🥰' },
  { id: 'roleplay', label: 'Roleplay', emoji: '🎭' },
] as const;

export const FAVORITE_OPTIONS = [
  { id: 'playful-conversations', label: 'Spicy dialogues', emoji: '💬' },
  { id: 'character-photos', label: 'Hot Photos', emoji: '📸' },
  { id: 'just-chatting', label: 'Just chatting', emoji: '☕' },
] as const;

export const GOAL_OPTIONS = [
  { id: 'ai-companion', label: 'Virtual AI Girl', emoji: '😍' },
  { id: 'connections', label: 'New Emotions', emoji: '🔥' },
  { id: 'something-new', label: 'Try something new', emoji: '😉' },
  { id: 'less-lonely', label: 'Feel Less Lonely', emoji: '❤️' },
] as const;

export type Pronouns = (typeof PRONOUN_OPTIONS)[number]['id'];
export type Interest = (typeof INTEREST_OPTIONS)[number]['id'];
export type Favorite = (typeof FAVORITE_OPTIONS)[number]['id'];
export type Goal = (typeof GOAL_OPTIONS)[number]['id'];

export const MAX_NAME_LENGTH = 40;
export const MAX_NAME_INPUT_LENGTH = 80;
export const ONBOARDING_STORAGE_KEY = 'companion.onboarding';
export const ONBOARDING_STORAGE_VERSION = 1;

/** A profile on this device, independent of authentication or paid access. */
export interface OnboardingDraft {
  name: string;
  pronouns: Pronouns | null;
  adultConfirmed: boolean;
  termsAccepted: boolean;
  interests: Interest[];
  favorites: Favorite[];
  goals: Goal[];
}

export interface OnboardingCheckpoint {
  step: OnboardingStep;
  completed: boolean;
  draft: OnboardingDraft;
}

export function createInitialDraft(): OnboardingDraft {
  return {
    name: '',
    pronouns: null,
    adultConfirmed: false,
    termsAccepted: false,
    interests: [],
    favorites: [],
    goals: [],
  };
}

export function createInitialCheckpoint(): OnboardingCheckpoint {
  return { step: 'splash', completed: false, draft: createInitialDraft() };
}

export function limitNameInput(name: string): string {
  let printable = '';
  let length = 0;
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || (code >= 127 && code <= 159)) continue;
    printable += character;
    length += 1;
    if (length === MAX_NAME_INPUT_LENGTH) break;
  }
  return printable;
}

export function isValidName(name: string): boolean {
  const length = Array.from(name.trim()).length;
  return length > 0 && length <= MAX_NAME_LENGTH;
}

export function hasRequiredConsent(draft: OnboardingDraft): boolean {
  return draft.adultConfirmed && draft.termsAccepted;
}

export function canContinueStep(
  step: OnboardingStep,
  draft: OnboardingDraft,
): boolean {
  if (step === 'splash') return true;
  if (!hasRequiredConsent(draft)) return false;
  if (ONBOARDING_STEPS.indexOf(step) >= ONBOARDING_STEPS.indexOf('profile')) {
    return isValidName(draft.name);
  }
  return true;
}

export function toggleSelection<T extends string>(items: T[], item: T): T[] {
  return items.includes(item)
    ? items.filter((value) => value !== item)
    : [...new Set([...items, item])];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function selectedOptions<T extends string>(
  value: unknown,
  options: readonly { id: T }[],
): T[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(options.map((option) => option.id));
  return [
    ...new Set(
      value
        .slice(0, 100)
        .filter(
          (item): item is T => typeof item === 'string' && allowed.has(item),
        ),
    ),
  ];
}

/** Discards unknown fields, including tokens, account IDs, and entitlements. */
export function restoreCheckpoint(value: unknown): OnboardingCheckpoint {
  if (!isRecord(value) || !isRecord(value.state)) {
    return createInitialCheckpoint();
  }
  const version = value.version;
  if (version !== 0 && version !== ONBOARDING_STORAGE_VERSION) {
    return createInitialCheckpoint();
  }
  const state = value.state;
  if (!isRecord(state.draft)) return createInitialCheckpoint();
  const source = state.draft;
  const pronouns = PRONOUN_OPTIONS.find(
    (option) => option.id === source.pronouns,
  );
  const draft: OnboardingDraft = {
    name:
      typeof source.name === 'string' ? limitNameInput(source.name).trim() : '',
    pronouns: pronouns?.id ?? null,
    adultConfirmed:
      version === ONBOARDING_STORAGE_VERSION && source.adultConfirmed === true,
    termsAccepted:
      version === ONBOARDING_STORAGE_VERSION && source.termsAccepted === true,
    interests: selectedOptions(source.interests, INTEREST_OPTIONS),
    favorites: selectedOptions(source.favorites, FAVORITE_OPTIONS),
    goals: selectedOptions(source.goals, GOAL_OPTIONS),
  };
  let step = ONBOARDING_STEPS.find((item) => item === state.step) ?? 'welcome';
  const completed =
    version === ONBOARDING_STORAGE_VERSION &&
    state.completed === true &&
    hasRequiredConsent(draft) &&
    isValidName(draft.name);

  if (completed) {
    step = 'offer';
  } else if (
    version === 0 ||
    (step !== 'splash' && !hasRequiredConsent(draft))
  ) {
    // Older consent text must be accepted again; preferences can be retained.
    step = 'welcome';
  } else if (
    ONBOARDING_STEPS.indexOf(step) > ONBOARDING_STEPS.indexOf('profile') &&
    !isValidName(draft.name)
  ) {
    step = 'profile';
  }
  return { step, completed, draft };
}

export function serializeCheckpoint(checkpoint: OnboardingCheckpoint): string {
  return JSON.stringify({
    version: ONBOARDING_STORAGE_VERSION,
    state: {
      step: checkpoint.step,
      completed: checkpoint.completed,
      draft: {
        name: checkpoint.draft.name,
        pronouns: checkpoint.draft.pronouns,
        adultConfirmed: checkpoint.draft.adultConfirmed,
        termsAccepted: checkpoint.draft.termsAccepted,
        interests: checkpoint.draft.interests,
        favorites: checkpoint.draft.favorites,
        goals: checkpoint.draft.goals,
      },
    },
  });
}
