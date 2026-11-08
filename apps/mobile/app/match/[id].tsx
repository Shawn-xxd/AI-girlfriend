import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { discoverPreview } from '../../src/api/queries';
import { useOnboardingStore } from '../../src/onboarding/store';
import { MatchScreen } from '../../src/match/MatchScreen';
export default function MatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const hydrated = useOnboardingStore((state) => state.hydrated);
  const completed = useOnboardingStore((state) => state.completed);
  const parsed = z.uuid().safeParse(id);
  if (!hydrated)
    return (
      <View style={{ flex: 1, backgroundColor: '#111' }}>
        <ActivityIndicator />
      </View>
    );
  if (!parsed.success) return <Redirect href="/(tabs)" />;
  if (!discoverPreview && !completed) return <Redirect href="/onboarding" />;
  return <MatchScreen key={parsed.data} id={parsed.data} />;
}
