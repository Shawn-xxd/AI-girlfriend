import { Redirect } from 'expo-router';
import { OnboardingScreen } from '../src/onboarding/OnboardingScreen';
import { useOnboardingStore } from '../src/onboarding/store';
export default function Home() {
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  if (hydrated && completed) return <Redirect href="/(tabs)" />;
  return <OnboardingScreen />;
}
