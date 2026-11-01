import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from 'zustand';
import { createOnboardingStore, type OnboardingState } from './store-core';

export { createOnboardingStore } from './store-core';
export type {
  OnboardingActions,
  OnboardingState,
  OnboardingStorage,
} from './store-core';

export const onboardingStore = createOnboardingStore(AsyncStorage);

void onboardingStore.getState().hydrate();

export function useOnboardingStore<T>(
  selector: (state: OnboardingState) => T,
): T {
  return useStore(onboardingStore, selector);
}
